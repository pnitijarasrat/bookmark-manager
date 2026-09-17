import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

// Applies the real migrations to a throwaway Postgres 17, then checks the
// rules that live in the database. Uses plain SQL, so it proves the schema
// itself rather than any repository code.

const OWNER_A = 'auth0|aaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_B = 'auth0|bbbbbbbbbbbbbbbbbbbbbbbb';

let container: StartedPostgreSqlContainer;
let db: pg.Client;

function runPrismaCli(...args: string[]) {
  return promisify(execFile)('npx', ['prisma', ...args], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17').start();
  await runPrismaCli('migrate', 'deploy');
  db = new pg.Client({ connectionString: container.getConnectionUri() });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
  await container?.stop();
});

beforeEach(async () => {
  await db.query('TRUNCATE bookmarks, collections');
});

async function createCollection(ownerId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO collections (owner_id, name, updated_at) VALUES ($1, $2, now()) RETURNING id',
    [ownerId, name],
  );
  return rows[0].id;
}

async function createBookmark(ownerId: string, collectionId: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookmarks (owner_id, url, title, collection_id, updated_at)
     VALUES ($1, 'https://example.com', 'Example', $2, now()) RETURNING id`,
    [ownerId, collectionId],
  );
  return rows[0].id;
}

async function bookmarksOf(ownerId: string) {
  const { rows } = await db.query<{ id: string; owner_id: string; collection_id: string | null }>(
    'SELECT id, owner_id, collection_id FROM bookmarks WHERE owner_id = $1 ORDER BY id',
    [ownerId],
  );
  return rows;
}

describe('the migrated database', () => {
  // The hand edits (citext, SET NULL (collection_id)) must not look like drift,
  // or `prisma migrate dev` would try to undo them.
  it('matches schema.prisma with no drift', async () => {
    await expect(
      runPrismaCli('migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('No difference detected') });
  });
});

describe('deleting a Collection', () => {
  it("keeps its Bookmarks, with owner_id intact and collection_id null (#9, test 5)", async () => {
    const reading = await createCollection(OWNER_A, 'Reading');
    const first = await createBookmark(OWNER_A, reading);
    const second = await createBookmark(OWNER_A, reading);

    await db.query('DELETE FROM collections WHERE id = $1 AND owner_id = $2', [reading, OWNER_A]);

    expect(await bookmarksOf(OWNER_A)).toEqual(
      [first, second].sort().map((id) => ({ id, owner_id: OWNER_A, collection_id: null })),
    );
  });

  it("leaves other Collections' Bookmarks and other Owners' data alone", async () => {
    const reading = await createCollection(OWNER_A, 'Reading');
    const work = await createCollection(OWNER_A, 'Work');
    const inWork = await createBookmark(OWNER_A, work);
    const theirs = await createCollection(OWNER_B, 'Reading');
    const theirBookmark = await createBookmark(OWNER_B, theirs);
    await createBookmark(OWNER_A, reading);

    await db.query('DELETE FROM collections WHERE id = $1', [reading]);

    expect((await bookmarksOf(OWNER_A)).find((b) => b.id === inWork)?.collection_id).toBe(work);
    expect(await bookmarksOf(OWNER_B)).toEqual([
      { id: theirBookmark, owner_id: OWNER_B, collection_id: theirs },
    ]);
  });
});

describe('the composite foreign key', () => {
  it("refuses a Bookmark in another Owner's Collection", async () => {
    const theirs = await createCollection(OWNER_B, 'Reading');
    await expect(createBookmark(OWNER_A, theirs)).rejects.toMatchObject({ code: '23503' });
  });

  it("refuses moving a Bookmark into another Owner's Collection", async () => {
    const bookmark = await createBookmark(OWNER_A, null);
    const theirs = await createCollection(OWNER_B, 'Reading');
    await expect(
      db.query('UPDATE bookmarks SET collection_id = $1 WHERE id = $2', [theirs, bookmark]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('allows an Uncategorised Bookmark', async () => {
    await expect(createBookmark(OWNER_A, null)).resolves.toBeTypeOf('string');
  });
});

describe('Collection names', () => {
  it('are unique per Owner, ignoring case', async () => {
    await createCollection(OWNER_A, 'Reading');
    await expect(createCollection(OWNER_A, 'rEADING')).rejects.toMatchObject({ code: '23505' });
  });

  it('can repeat across Owners', async () => {
    await createCollection(OWNER_A, 'Reading');
    await expect(createCollection(OWNER_B, 'reading')).resolves.toBeTypeOf('string');
  });

  it('sort ignoring case', async () => {
    for (const name of ['beta', 'Alpha', 'Gamma']) await createCollection(OWNER_A, name);
    const { rows } = await db.query<{ name: string }>(
      'SELECT name FROM collections WHERE owner_id = $1 ORDER BY name, id',
      [OWNER_A],
    );
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'beta', 'Gamma']);
  });
});

describe('IDs', () => {
  it('are database-generated UUIDv4', async () => {
    const id = await createCollection(OWNER_A, 'Reading');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('Bookmark notes', () => {
  it('default to an empty string', async () => {
    const id = await createBookmark(OWNER_A, null);
    const { rows } = await db.query('SELECT notes FROM bookmarks WHERE id = $1', [id]);
    expect(rows[0].notes).toBe('');
  });
});
