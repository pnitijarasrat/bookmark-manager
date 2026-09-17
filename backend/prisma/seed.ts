import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';

// Demo data for two Owners. See DECISIONS.md, "Seed data".
//
//   npm run db:seed          seeds each Owner that has no rows yet
//   npm run db:seed:reset    deletes and re-creates the seed Owners' rows
//
// Owner A is the tenant's test user, from SEED_OWNER_A_SUB. Owner B can never
// sign in: B's rows exist to show what A must never see. To count each
// Owner's rows (the README from #23 will carry this too):
//
//   docker compose exec postgres psql -U bookmarks -d bookmarks -c "SELECT owner_id,
//     (SELECT count(*) FROM collections c WHERE c.owner_id = o.owner_id) AS collections,
//     (SELECT count(*) FROM bookmarks b WHERE b.owner_id = o.owner_id) AS bookmarks
//     FROM (SELECT owner_id FROM collections UNION SELECT owner_id FROM bookmarks) o
//     ORDER BY owner_id"

export const OWNER_B = 'auth0|000000000000000000000000';

export type SeedOwners = { ownerA?: string; ownerB: string };

type Tx = Prisma.TransactionClient;

type SeedBookmark = { url: string; title: string; notes: string; collection?: string };
type SeedData = { collections: string[]; bookmarks: SeedBookmark[] };

const MDN = 'https://developer.mozilla.org/en-US/';
const POSTGRES_DOCS = 'https://www.postgresql.org/docs/current/';

// Oldest first. A's "Reading" holds more than a page (50), so "Load more"
// shows up; "Recipes" stays empty.
const OWNER_A_DATA: SeedData = {
  collections: ['Reading', 'Recipes'],
  bookmarks: [
    ...Array.from({ length: 55 }, (_, i) => ({
      url: `https://example.com/reading/${i + 1}`,
      title: `Reading list item ${i + 1}`,
      notes: i % 5 === 0 ? `Note on item ${i + 1}` : '',
      collection: 'Reading',
    })),
    { url: POSTGRES_DOCS, title: 'PostgreSQL documentation', notes: 'Both seed Owners saved this URL.' },
    { url: 'https://nestjs.com/', title: 'NestJS', notes: '' },
    { url: MDN, title: 'MDN Web Docs', notes: 'Both seed Owners saved this URL.' },
  ],
};

// B's "reading" clashes with A's "Reading" in all but case. Every title and
// note names B, so a leak is obvious.
const B_ONLY = 'Owner B only: if you can see this, isolation is broken';
const OWNER_B_DATA: SeedData = {
  collections: ['reading', 'Owner B only'],
  bookmarks: [
    { url: 'https://example.org/owner-b/1', title: 'Owner B only: reading 1', notes: B_ONLY, collection: 'reading' },
    { url: 'https://example.org/owner-b/2', title: 'Owner B only: reading 2', notes: B_ONLY, collection: 'reading' },
    { url: MDN, title: 'Owner B only: MDN Web Docs', notes: B_ONLY },
    { url: POSTGRES_DOCS, title: 'Owner B only: PostgreSQL documentation', notes: B_ONLY },
  ],
};

const MINUTE = 60_000;

// Writes one Owner's rows, each a minute after the last, the newest now.
async function insert(tx: Tx, ownerId: string, data: SeedData) {
  const rows = data.collections.length + data.bookmarks.length;
  const start = Date.now() - (rows - 1) * MINUTE;
  let row = 0;
  const nextTime = () => new Date(start + row++ * MINUTE);

  const ids = new Map<string, string>();
  for (const name of data.collections) {
    const { id } = await tx.collection.create({
      data: { ownerId, name, createdAt: nextTime() },
      select: { id: true },
    });
    ids.set(name, id);
  }
  await tx.bookmark.createMany({
    data: data.bookmarks.map(({ collection, ...bookmark }) => ({
      ...bookmark,
      ownerId,
      collectionId: collection === undefined ? null : ids.get(collection)!,
      createdAt: nextTime(),
    })),
  });
}

// Holds until the transaction ends, so overlapping runs (two `npm run dev`
// started together) take turns on each Owner instead of both writing.
async function lock(tx: Tx, ownerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'seed:' + ownerId}))`;
}

async function remove(tx: Tx, ownerId: string) {
  await tx.bookmark.deleteMany({ where: { ownerId } });
  await tx.collection.deleteMany({ where: { ownerId } });
}

function ownersToSeed({ ownerA, ownerB }: SeedOwners) {
  const list = [{ label: 'Owner B', ownerId: ownerB, data: OWNER_B_DATA }];
  if (ownerA) list.unshift({ label: 'Owner A', ownerId: ownerA, data: OWNER_A_DATA });
  return list;
}

/**
 * Seeds each Owner that has no Collections and no Bookmarks, and leaves any
 * other Owner alone. Returns what it did, one line per Owner.
 */
export async function seed(prisma: PrismaClient, owners: SeedOwners): Promise<string[]> {
  const report: string[] = [];
  for (const { label, ownerId, data } of ownersToSeed(owners)) {
    const seeded = await prisma.$transaction(async (tx) => {
      await lock(tx, ownerId);
      const [collections, bookmarks] = await Promise.all([
        tx.collection.count({ where: { ownerId } }),
        tx.bookmark.count({ where: { ownerId } }),
      ]);
      if (collections + bookmarks > 0) return false;
      await insert(tx, ownerId, data);
      return true;
    });
    report.push(seeded ? `${label}: seeded.` : `${label}: already has data, left alone.`);
  }
  return report;
}

/** Deletes and re-creates the seed Owners' rows, in one transaction. */
export async function reset(prisma: PrismaClient, owners: SeedOwners): Promise<string[]> {
  const list = ownersToSeed(owners);
  await prisma.$transaction(async (tx) => {
    for (const { ownerId } of list) await lock(tx, ownerId);
    for (const { ownerId } of list) await remove(tx, ownerId);
    for (const { ownerId, data } of list) await insert(tx, ownerId, data);
  });
  return list.map(({ label }) => `${label}: reset.`);
}

export function connect(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

// A reset deletes rows, so it only runs against the local Compose database.
function assertComposeDatabase(databaseUrl: string | undefined) {
  let url: URL | undefined;
  try {
    url = new URL(databaseUrl ?? '');
  } catch {
    // Handled below.
  }
  if (!url || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5434') {
    throw new Error('Refusing to reset: DATABASE_URL must point at the Compose database on localhost:5434.');
  }
}

const NO_OWNER_A = [
  'SEED_OWNER_A_SUB is not set, so Owner A was skipped.',
  'To seed your own account as Owner A:',
  '  1. Sign in to the app, and copy the token after "Bearer " from any API request in the Network tab.',
  '  2. Run: npm run whoami --prefix backend -- <token>',
  '  3. Set SEED_OWNER_A_SUB to the printed sub in backend/.env, and restart npm run dev.',
].join('\n');

/** The command line: `--reset` resets, and anything else seeds. */
export async function main(
  args: string[],
  env: Record<string, string | undefined>,
  log: (line: string) => void,
) {
  const isReset = args.includes('--reset');
  if (isReset) assertComposeDatabase(env.DATABASE_URL);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const owners: SeedOwners = { ownerA: env.SEED_OWNER_A_SUB?.trim() || undefined, ownerB: OWNER_B };
  const prisma = connect(env.DATABASE_URL);
  try {
    const report = await (isReset ? reset : seed)(prisma, owners);
    for (const line of report) log(line);
  } finally {
    await prisma.$disconnect();
  }
  if (!owners.ownerA) log(NO_OWNER_A);
}

if (import.meta.main) {
  await import('dotenv/config');
  try {
    await main(process.argv.slice(2), process.env, console.log);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
