import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { BookmarkRepository } from '../src/bookmarks/bookmark.repository.js';
import { BookmarksModule } from '../src/bookmarks/bookmarks.module.js';
import { CollectionRepository } from '../src/collections/collection.repository.js';
import { CollectionsModule } from '../src/collections/collections.module.js';
import { AppConfig, loadConfig } from '../src/config/app-config.js';
import { ConfigModule } from '../src/config/config.module.js';
import { missingId, newOwner, startDatabase } from './support/database.js';
import { TEST_AUDIENCE, TEST_ISSUER } from './support/identity-provider.js';

// The Owner scope, proven on real Postgres: another Owner's row behaves
// exactly like a row that doesn't exist.

let db: Awaited<ReturnType<typeof startDatabase>>;
let moduleRef: TestingModule;
let collections: CollectionRepository;
let bookmarks: BookmarkRepository;
let a: string;
let b: string;

beforeAll(async () => {
  db = await startDatabase();
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, CollectionsModule, BookmarksModule],
  })
    .overrideProvider(AppConfig)
    .useValue(
      loadConfig({
        DATABASE_URL: db.url,
        AUTH0_ISSUER: TEST_ISSUER,
        AUTH0_AUDIENCE: TEST_AUDIENCE,
        AUTH0_JWKS_URL: `${TEST_ISSUER}jwks.json`,
      }),
    )
    .compile();
  collections = moduleRef.get(CollectionRepository);
  bookmarks = moduleRef.get(BookmarkRepository);
});

afterAll(async () => {
  await moduleRef?.close();
  await db?.stop();
});

beforeEach(() => {
  a = newOwner();
  b = newOwner();
});

const bookmarkInput = { url: 'https://example.com/post', title: 'A post' };

// Runs a call that should fail, and returns what it threw.
async function failure(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
}

// "Not yours" and "doesn't exist" must be indistinguishable.
async function expectSameNotFound(otherOwners: () => Promise<unknown>, missing: () => Promise<unknown>) {
  const [theirs, nobodys] = [await failure(otherOwners), await failure(missing)];
  expect(theirs).toBeInstanceOf(NotFoundException);
  expect(nobodys).toBeInstanceOf(NotFoundException);
  expect(theirs).toEqual(nobodys);
}

describe('CollectionRepository', () => {
  it('creates and reads a Collection, without ownerId', async () => {
    const created = await collections.create(a, { name: 'Reading' });
    expect(created).toEqual({
      id: expect.any(String),
      name: 'Reading',
      bookmarkCount: 0,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    await expect(collections.findById(a, created.id)).resolves.toEqual(created);
  });

  it('counts only its own Bookmarks', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    await bookmarks.create(a, { ...bookmarkInput, collectionId: reading.id });
    await bookmarks.create(a, { ...bookmarkInput, collectionId: reading.id });
    await bookmarks.create(a, bookmarkInput);
    expect((await collections.findById(a, reading.id)).bookmarkCount).toBe(2);
  });

  it('updates its own Collection', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    const updated = await collections.update(a, reading.id, { name: 'Later' });
    expect(updated).toMatchObject({ id: reading.id, name: 'Later', bookmarkCount: 0 });
  });

  it('deletes its own Collection', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    await collections.delete(a, reading.id);
    await expect(collections.findById(a, reading.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("another Owner's Collection", () => {
    it('cannot be read, and looks missing', async () => {
      const reading = await collections.create(a, { name: 'Reading' });
      await expectSameNotFound(
        () => collections.findById(b, reading.id),
        () => collections.findById(b, missingId()),
      );
    });

    it('cannot be updated, looks missing, and is unchanged', async () => {
      const reading = await collections.create(a, { name: 'Reading' });
      await expectSameNotFound(
        () => collections.update(b, reading.id, { name: 'Mine now' }),
        () => collections.update(b, missingId(), { name: 'Mine now' }),
      );
      await expect(collections.findById(a, reading.id)).resolves.toEqual(reading);
    });

    it('cannot be deleted, looks missing, and keeps its Bookmarks', async () => {
      const reading = await collections.create(a, { name: 'Reading' });
      const inside = await bookmarks.create(a, { ...bookmarkInput, collectionId: reading.id });
      await expectSameNotFound(
        () => collections.delete(b, reading.id),
        () => collections.delete(b, missingId()),
      );
      await expect(collections.findById(a, reading.id)).resolves.toMatchObject({ bookmarkCount: 1 });
      await expect(bookmarks.findById(a, inside.id)).resolves.toEqual(inside);
    });
  });

  it('a second delete of the same ID is a 404', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    await collections.delete(a, reading.id);
    await expect(collections.delete(a, reading.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleting a Collection makes its Bookmarks Uncategorised, and leaves other Owners alone', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    const inside = await bookmarks.create(a, { ...bookmarkInput, collectionId: reading.id });
    const theirs = await collections.create(b, { name: 'Reading' });
    const theirBookmark = await bookmarks.create(b, { ...bookmarkInput, collectionId: theirs.id });
    const theirsBefore = await collections.findById(b, theirs.id);

    await collections.delete(a, reading.id);

    await expect(bookmarks.findById(a, inside.id)).resolves.toEqual({ ...inside, collectionId: null });
    await expect(collections.findById(b, theirs.id)).resolves.toEqual(theirsBefore);
    await expect(bookmarks.findById(b, theirBookmark.id)).resolves.toEqual(theirBookmark);
  });
});

describe('BookmarkRepository', () => {
  it('creates and reads a Bookmark, without ownerId', async () => {
    const created = await bookmarks.create(a, bookmarkInput);
    expect(created).toEqual({
      id: expect.any(String),
      url: bookmarkInput.url,
      title: bookmarkInput.title,
      notes: '',
      collectionId: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    await expect(bookmarks.findById(a, created.id)).resolves.toEqual(created);
  });

  it('updates its own Bookmark, including moving it between Collections', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    const created = await bookmarks.create(a, bookmarkInput);
    const moved = await bookmarks.update(a, created.id, { notes: 'hi', collectionId: reading.id });
    expect(moved).toMatchObject({ id: created.id, notes: 'hi', collectionId: reading.id, title: 'A post' });
    const back = await bookmarks.update(a, created.id, { collectionId: null });
    expect(back.collectionId).toBeNull();
  });

  it('deletes its own Bookmark', async () => {
    const created = await bookmarks.create(a, bookmarkInput);
    await bookmarks.delete(a, created.id);
    await expect(bookmarks.findById(a, created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("another Owner's Bookmark", () => {
    it('cannot be read, and looks missing', async () => {
      const created = await bookmarks.create(a, bookmarkInput);
      await expectSameNotFound(
        () => bookmarks.findById(b, created.id),
        () => bookmarks.findById(b, missingId()),
      );
    });

    it('cannot be updated, looks missing, and is unchanged', async () => {
      const created = await bookmarks.create(a, bookmarkInput);
      await expectSameNotFound(
        () => bookmarks.update(b, created.id, { title: 'Mine now' }),
        () => bookmarks.update(b, missingId(), { title: 'Mine now' }),
      );
      await expect(bookmarks.findById(a, created.id)).resolves.toEqual(created);
    });

    it('cannot be deleted, looks missing, and still exists', async () => {
      const created = await bookmarks.create(a, bookmarkInput);
      await expectSameNotFound(
        () => bookmarks.delete(b, created.id),
        () => bookmarks.delete(b, missingId()),
      );
      await expect(bookmarks.findById(a, created.id)).resolves.toEqual(created);
    });
  });

  describe("another Owner's Collection", () => {
    it('cannot hold a new Bookmark, and looks missing', async () => {
      const theirs = await collections.create(a, { name: 'Reading' });
      await expectSameNotFound(
        () => bookmarks.create(b, { ...bookmarkInput, collectionId: theirs.id }),
        () => bookmarks.create(b, { ...bookmarkInput, collectionId: missingId() }),
      );
      await expect(collections.findById(a, theirs.id)).resolves.toMatchObject({ bookmarkCount: 0 });
    });

    it('cannot receive a moved Bookmark, and the Bookmark is unchanged', async () => {
      const theirs = await collections.create(a, { name: 'Reading' });
      const mine = await bookmarks.create(b, bookmarkInput);
      await expectSameNotFound(
        () => bookmarks.update(b, mine.id, { collectionId: theirs.id }),
        () => bookmarks.update(b, mine.id, { collectionId: missingId() }),
      );
      await expect(bookmarks.findById(b, mine.id)).resolves.toEqual(mine);
    });
  });

  it('turns a Collection deleted between the check and the write into a 404', async () => {
    const reading = await collections.create(a, { name: 'Reading' });
    // Simulates the race: the check sees the Collection, the write doesn't.
    const found = await collections.findById(a, reading.id);
    await collections.delete(a, reading.id);
    const repo = bookmarks as unknown as { assertCollection: (o: string, id: string) => Promise<void> };
    const original = repo.assertCollection;
    repo.assertCollection = async () => {};
    try {
      await expect(
        bookmarks.create(a, { ...bookmarkInput, collectionId: found.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      repo.assertCollection = original;
    }
  });

  it('passes other database errors through, for the filter to make a generic 500', async () => {
    // A duplicate name is P2002. The Collection routes will map it to a 409.
    await collections.create(a, { name: 'Reading' });
    const error = await failure(() => collections.create(a, { name: 'reading' }));
    expect(error).toMatchObject({ code: 'P2002' });
  });
});
