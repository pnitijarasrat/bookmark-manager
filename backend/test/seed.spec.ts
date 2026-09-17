import { connect, main, OWNER_B, reset, seed } from '../prisma/seed.js';
import { startApi, type Api } from './support/api.js';

// The seed script, run against a throwaway Postgres. See DECISIONS.md,
// "Seed data", and #20.

let api: Api;
let prisma: ReturnType<typeof connect>;

beforeAll(async () => {
  api = await startApi();
  prisma = connect(api.databaseUrl);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await api?.stop();
});

type Item = {
  id: string;
  name?: string;
  title?: string;
  notes?: string;
  url?: string;
  collectionId?: string | null;
  createdAt?: string;
};
type Owner = { sub: string; token: string };

// Every item of a list, following `nextCursor`. Also returns how many pages
// there were.
async function listAllPages(path: string, token: string) {
  const items: Item[] = [];
  let pages = 0;
  let cursor: string | null = null;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const res = await api.request(cursor ? `${path}${sep}cursor=${cursor}` : path, { token });
    expect(res.status).toBe(200);
    const body: { items: Item[]; nextCursor: string | null } = await res.json();
    items.push(...body.items);
    cursor = body.nextCursor;
    pages++;
  } while (cursor);
  return { items, pages };
}

// An Owner's rows as the API lists them, without ids or timestamps, so two
// runs can be compared. Read through the API, so this test never queries the
// database itself; the test identity provider can sign for any `sub`,
// including the placeholder B.
async function rowsOf(sub: string) {
  const token = await api.idp.tokenFor(sub);
  const collections = (await listAllPages('/collections', token)).items;
  const names = new Map(collections.map((c) => [c.id, c.name!]));
  const bookmarks = (await listAllPages('/bookmarks', token)).items.map((bm) => ({
    url: bm.url!,
    title: bm.title!,
    notes: bm.notes!,
    collection: bm.collectionId ? names.get(bm.collectionId)! : null,
  }));
  return { collections: collections.map((c) => c.name!).toSorted(), bookmarks };
}

// Everything an Owner can list, ids and timestamps included, to prove that a
// run left the Owner exactly as it was.
async function snapshot(sub: string) {
  const token = await api.idp.tokenFor(sub);
  return {
    collections: (await listAllPages('/collections', token)).items,
    bookmarks: (await listAllPages('/bookmarks', token)).items,
  };
}

type Rows = Awaited<ReturnType<typeof rowsOf>>;
const inCollection = (rows: Rows, name: string | null) =>
  rows.bookmarks.filter((bm) => bm.collection === name).length;

async function expectSeeded(sub: string, { large }: { large: boolean }) {
  const { bookmarks } = await rowsOf(sub);
  expect(bookmarks.length).toBeGreaterThan(large ? 50 : 0);
}

async function ownerWithData(): Promise<Owner> {
  const owner = await api.owner();
  const collection = await (
    await api.send('POST', '/collections', owner.token, { name: 'Mine' })
  ).json();
  await api.send('POST', '/bookmarks', owner.token, {
    url: 'https://mine.test',
    title: 'Not seed data',
    collectionId: collection.id,
  });
  return owner;
}

describe('seed()', () => {
  it('gives each Owner the agreed data', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });

    const rowsA = await rowsOf(a.sub);
    const rowsB = await rowsOf(b.sub);

    // Two Collections each, sharing a name in different casing.
    expect(rowsA.collections).toHaveLength(2);
    expect(rowsB.collections).toHaveLength(2);
    expect(rowsA.collections).toContain('Reading');
    expect(rowsB.collections).toContain('reading');

    for (const rows of [rowsA, rowsB]) {
      // One Collection is empty.
      expect(rows.collections.filter((name) => inCollection(rows, name) === 0)).toHaveLength(1);
      // Some Uncategorised Bookmarks.
      expect(rows.bookmarks.filter((bm) => bm.collection === null).length).toBeGreaterThan(0);
    }

    // A's large Collection needs "Load more" at the default page size of 50.
    expect(inCollection(rowsA, 'Reading')).toBeGreaterThan(50);

    // Some URLs appear for both Owners.
    const urlsA = new Set(rowsA.bookmarks.map((bm) => bm.url));
    expect(rowsB.bookmarks.filter((bm) => urlsA.has(bm.url)).length).toBeGreaterThan(0);

    // Every one of B's titles and notes names B.
    for (const bm of rowsB.bookmarks) {
      expect(bm.title).toContain('Owner B');
      expect(bm.notes).toContain('Owner B');
    }
  });

  it('gives every row its own createdAt, one minute apart', async () => {
    const a = await api.owner();
    await seed(prisma, { ownerA: a.sub, ownerB: (await api.owner()).sub });

    const { collections, bookmarks } = await snapshot(a.sub);
    const times = [...collections, ...bookmarks]
      .map((row) => Date.parse(row.createdAt!))
      .toSorted((x, y) => x - y);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(60_000);
  });

  it('does nothing for an Owner who already has rows, even if they are not seed data', async () => {
    const a = await ownerWithData();
    const b = await api.owner();
    const before = await snapshot(a.sub);

    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });

    expect(await snapshot(a.sub)).toEqual(before);
    // B was empty, so B is seeded.
    await expectSeeded(b.sub, { large: false });
  });

  it('counts an Owner with only a Collection, or only a Bookmark, as not empty', async () => {
    const [onlyCollection, onlyBookmark] = [await api.owner(), await api.owner()];
    await api.send('POST', '/collections', onlyCollection.token, { name: 'Just this' });
    await api.send('POST', '/bookmarks', onlyBookmark.token, { url: 'https://x.test', title: 'x' });

    await seed(prisma, { ownerA: onlyCollection.sub, ownerB: onlyBookmark.sub });

    expect(await rowsOf(onlyCollection.sub)).toEqual({ collections: ['Just this'], bookmarks: [] });
    expect((await rowsOf(onlyBookmark.sub)).collections).toEqual([]);
  });

  it('changes nothing when run a second time', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });
    const before = { a: await snapshot(a.sub), b: await snapshot(b.sub) };

    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });

    expect({ a: await snapshot(a.sub), b: await snapshot(b.sub) }).toEqual(before);
  });

  it('seeds each Owner once when two runs overlap', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    const reports = await Promise.all([
      seed(prisma, { ownerA: a.sub, ownerB: b.sub }),
      seed(prisma, { ownerA: a.sub, ownerB: b.sub }),
    ]);

    expect(reports.flat().filter((line) => line.endsWith('seeded.'))).toHaveLength(2);
    expect((await rowsOf(a.sub)).collections).toEqual(['Reading', 'Recipes']);
    expect((await rowsOf(b.sub)).collections).toEqual(['Owner B only', 'reading']);
  });

  it('seeds only B when there is no A', async () => {
    const b = await api.owner();
    await seed(prisma, { ownerB: b.sub });
    await expectSeeded(b.sub, { large: false });
  });
});

describe('reset()', () => {
  it('gives the same rows when run twice, and leaves a third Owner untouched', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    const third = await ownerWithData();
    const thirdBefore = await snapshot(third.sub);

    // A adds a row of their own, which the reset removes.
    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });
    await api.send('POST', '/bookmarks', a.token, { url: 'https://extra.test', title: 'Extra' });

    await reset(prisma, { ownerA: a.sub, ownerB: b.sub });
    const first = { a: await rowsOf(a.sub), b: await rowsOf(b.sub) };
    await reset(prisma, { ownerA: a.sub, ownerB: b.sub });
    const second = { a: await rowsOf(a.sub), b: await rowsOf(b.sub) };

    expect(second).toEqual(first);
    expect(first.a.bookmarks.map((bm) => bm.url)).not.toContain('https://extra.test');
    expect(await snapshot(third.sub)).toEqual(thirdBefore);
  });

  it('gives the same rows when two resets overlap', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });
    const expected = { a: await rowsOf(a.sub), b: await rowsOf(b.sub) };

    await Promise.all([
      reset(prisma, { ownerA: a.sub, ownerB: b.sub }),
      reset(prisma, { ownerA: a.sub, ownerB: b.sub }),
    ]);

    expect({ a: await rowsOf(a.sub), b: await rowsOf(b.sub) }).toEqual(expected);
  });

  it('rebuilds an Owner who had no rows', async () => {
    const [a, b] = [await api.owner(), await api.owner()];
    await reset(prisma, { ownerA: a.sub, ownerB: b.sub });
    await expectSeeded(a.sub, { large: true });
  });

  it('touches only B when there is no A', async () => {
    const [a, b] = [await ownerWithData(), await api.owner()];
    const before = await snapshot(a.sub);
    await reset(prisma, { ownerB: b.sub });
    expect(await snapshot(a.sub)).toEqual(before);
    await expectSeeded(b.sub, { large: false });
  });
});

describe('the command line', () => {
  const run = async (args: string[], env: Record<string, string | undefined>) => {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const result = await main(args, env, log).then(
      () => 'ok',
      (error: Error) => error,
    );
    return { result, output: lines.join('\n') };
  };

  it('without SEED_OWNER_A_SUB, seeds only B and says how to set it', async () => {
    const other = await ownerWithData();
    const before = await snapshot(other.sub);

    const { result, output } = await run([], { DATABASE_URL: api.databaseUrl });

    expect(result).toBe('ok');
    expect(output).toContain('SEED_OWNER_A_SUB');
    expect(output).toContain('whoami');
    await expectSeeded(OWNER_B, { large: false });
    expect(await snapshot(other.sub)).toEqual(before);
  });

  it('with SEED_OWNER_A_SUB, seeds A too and prints no hint', async () => {
    const a = await api.owner();
    const { result, output } = await run([], { DATABASE_URL: api.databaseUrl, SEED_OWNER_A_SUB: a.sub });
    expect(result).toBe('ok');
    expect(output).not.toContain('whoami');
    await expectSeeded(a.sub, { large: true });
  });

  it.each([
    ['a remote host', 'postgresql://bookmarks:bookmarks@db.example.com:5434/bookmarks'],
    ['another local port', 'postgresql://bookmarks:bookmarks@localhost:5432/bookmarks'],
    ['a look-alike host', 'postgresql://bookmarks:bookmarks@localhost.example.com:5434/bookmarks'],
    ['no URL at all', undefined],
  ])('refuses to reset %s', async (_, url) => {
    const { result } = await run(['--reset'], { DATABASE_URL: url });
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/localhost:5434/);
  });

  it('refuses to reset the test database, which is not on port 5434, and changes nothing', async () => {
    const a = await ownerWithData();
    const before = await snapshot(a.sub);
    const { result } = await run(['--reset'], { DATABASE_URL: api.databaseUrl, SEED_OWNER_A_SUB: a.sub });
    expect(result).toBeInstanceOf(Error);
    expect(await snapshot(a.sub)).toEqual(before);
  });
});

describe('after seeding, A sees none of B’s rows', () => {
  let a: Owner;
  let b: Owner;
  let bIds: Set<string>;

  beforeAll(async () => {
    [a, b] = [await api.owner(), await api.owner()];
    await seed(prisma, { ownerA: a.sub, ownerB: b.sub });
    const theirs = [
      ...(await listAllPages('/collections', b.token)).items,
      ...(await listAllPages('/bookmarks', b.token)).items,
    ];
    expect(theirs.length).toBeGreaterThan(0);
    bIds = new Set(theirs.map((item) => item.id));
  });

  const expectNoneOfB = (items: Item[]) => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(bIds.has(item.id)).toBe(false);
      expect(JSON.stringify(item)).not.toContain('Owner B');
    }
  };

  it('in /collections', async () => {
    const { items } = await listAllPages('/collections', a.token);
    expectNoneOfB(items);
    expect(items.map((c) => c.name)).toContain('Reading');
    expect(items.map((c) => c.name)).not.toContain('reading');
  });

  it('in /bookmarks, across both pages', async () => {
    const { items, pages } = await listAllPages('/bookmarks', a.token);
    expect(pages).toBe(2);
    expectNoneOfB(items);
    // Every one of A's: the large Collection plus the Uncategorised.
    const rowsA = await rowsOf(a.sub);
    expect(items).toHaveLength(inCollection(rowsA, 'Reading') + inCollection(rowsA, null));
  });

  it('in each Collection’s nested list, across both pages of the large one', async () => {
    const collections = (await listAllPages('/collections', a.token)).items;
    const reading = collections.find((c) => c.name === 'Reading')!;
    const nested = await listAllPages(`/collections/${reading.id}/bookmarks`, a.token);
    expect(nested.pages).toBe(2);
    expectNoneOfB(nested.items);
    const filtered = await listAllPages(`/bookmarks?collectionId=${reading.id}`, a.token);
    expect(filtered.pages).toBe(2);
    expectNoneOfB(filtered.items);
  });

  it('among the Uncategorised', async () => {
    expectNoneOfB((await listAllPages('/bookmarks?collectionId=none', a.token)).items);
  });

  it('in a search for a URL both Owners have', async () => {
    const urlsB = (await listAllPages('/bookmarks', b.token)).items.map((bm) => bm.url!);
    const shared = (await listAllPages('/bookmarks', a.token)).items.find((bm) => urlsB.includes(bm.url!))!;
    expect(shared).toBeDefined();
    const { items } = await listAllPages(`/bookmarks?q=${encodeURIComponent(shared.url!)}`, a.token);
    expectNoneOfB(items);
  });

  it('in a search for "Owner B"', async () => {
    const { items } = await listAllPages(`/bookmarks?q=${encodeURIComponent('Owner B')}`, a.token);
    expect(items).toEqual([]);
  });
});
