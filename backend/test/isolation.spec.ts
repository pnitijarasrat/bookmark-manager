import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Owner } from '../src/auth/owner.decorator.js';
import { BookmarkRepository } from '../src/bookmarks/bookmark.repository.js';
import { BookmarksModule } from '../src/bookmarks/bookmarks.module.js';
import { CollectionRepository } from '../src/collections/collection.repository.js';
import { CollectionsModule } from '../src/collections/collections.module.js';
import { startApp, type TestApp } from './support/app.js';
import { missingId, startDatabase } from './support/database.js';
import { createIdentityProvider, OWNER_A, OWNER_B, type IdentityProvider } from './support/identity-provider.js';

// End to end, with real tokens and real Postgres: a 404 for another Owner's
// ID is byte-for-byte the 404 for an ID that doesn't exist. Probed through a
// test-only controller until the resource routes exist.

const NOT_FOUND = '{"type":"about:blank","title":"Not Found","status":404}';

class NameBody {
  @IsString()
  name!: string;
}

@Controller('probe')
class RepositoryProbe {
  constructor(
    private readonly collections: CollectionRepository,
    private readonly bookmarks: BookmarkRepository,
  ) {}

  @Get('collections/:id')
  collection(@Owner() owner: string, @Param('id') id: string) {
    return this.collections.findById(owner, id);
  }

  @Post('collections')
  createCollection(@Owner() owner: string, @Body() body: NameBody) {
    return this.collections.create(owner, body);
  }

  @Put('collections/:id')
  renameCollection(@Owner() owner: string, @Param('id') id: string, @Body() body: NameBody) {
    return this.collections.update(owner, id, body);
  }

  @Delete('collections/:id')
  @HttpCode(204)
  deleteCollection(@Owner() owner: string, @Param('id') id: string) {
    return this.collections.delete(owner, id);
  }

  @Get('bookmarks/:id')
  bookmark(@Owner() owner: string, @Param('id') id: string) {
    return this.bookmarks.findById(owner, id);
  }
}

let db: Awaited<ReturnType<typeof startDatabase>>;
let idp: IdentityProvider;
let api: TestApp;
let collectionId: string;
let bookmarkId: string;

beforeAll(async () => {
  db = await startDatabase();
  idp = await createIdentityProvider();
  api = await startApp({
    idp,
    databaseUrl: db.url,
    imports: [CollectionsModule, BookmarksModule],
    controllers: [RepositoryProbe],
  });
  const collections = api.app.get(CollectionRepository);
  collectionId = (await collections.create(OWNER_A, { name: 'Reading' })).id;
  bookmarkId = (
    await api.app.get(BookmarkRepository).create(OWNER_A, {
      url: 'https://example.com',
      title: 'Example',
      collectionId,
    })
  ).id;
});

afterAll(async () => {
  await api?.close();
  await db?.stop();
});

describe.each([
  ['a Collection', () => `/probe/collections/${collectionId}`, '/probe/collections'],
  ['a Bookmark', () => `/probe/bookmarks/${bookmarkId}`, '/probe/bookmarks'],
])('reading %s', (_, ownPath, base) => {
  it('works for its Owner, and never returns ownerId', async () => {
    const res = await api.request(ownPath(), { token: await idp.tokens.ownerA() });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(OWNER_A);
    expect(text).not.toContain('ownerId');
  });

  it("gives another Owner the same bytes as a missing ID", async () => {
    const token = await idp.tokens.ownerB();
    const theirs = await api.request(ownPath(), { token });
    const missing = await api.request(`${base}/${missingId()}`, { token });

    expect([theirs.status, missing.status]).toEqual([404, 404]);
    expect(theirs.headers.get('content-type')).toBe(missing.headers.get('content-type'));
    const [theirsBody, missingBody] = [await theirs.text(), await missing.text()];
    expect(theirsBody).toBe(NOT_FOUND);
    expect(missingBody).toBe(NOT_FOUND);
    expect(theirsBody).not.toContain(OWNER_B);
  });

  it('refuses a caller with no token before looking anything up', async () => {
    const res = await api.request(ownPath());
    expect(res.status).toBe(401);
  });
});

it("gives another Owner's delete the same 404 as a missing ID, and deletes nothing", async () => {
  const token = await idp.tokens.ownerB();
  const theirs = await api.request(`/probe/collections/${collectionId}`, { method: 'DELETE', token });
  const missing = await api.request(`/probe/collections/${missingId()}`, { method: 'DELETE', token });
  expect([await theirs.text(), await missing.text()]).toEqual([NOT_FOUND, NOT_FOUND]);

  const still = await api.request(`/probe/collections/${collectionId}`, { token: await idp.tokens.ownerA() });
  expect(await still.json()).toMatchObject({ id: collectionId, bookmarkCount: 1 });
});

it("gives another Owner's update the same 404 as a missing ID, and changes nothing", async () => {
  const token = await idp.tokens.ownerB();
  const rename = (id: string) =>
    api.request(`/probe/collections/${id}`, {
      method: 'PUT',
      token,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mine now' }),
    });
  const [theirs, missing] = [await rename(collectionId), await rename(missingId())];
  expect([theirs.status, missing.status]).toEqual([404, 404]);
  expect([await theirs.text(), await missing.text()]).toEqual([NOT_FOUND, NOT_FOUND]);

  const still = await api.request(`/probe/collections/${collectionId}`, { token: await idp.tokens.ownerA() });
  expect(await still.json()).toMatchObject({ name: 'Reading' });
});

it('answers an unmapped Prisma error with a bare 500, and logs no database details', async () => {
  // A duplicate name is P2002, which this slice doesn't map.
  const token = await idp.tokens.ownerA();
  const create = () =>
    api.request('/probe/collections', {
      method: 'POST',
      token,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate-f00d' }),
    });
  expect((await create()).status).toBe(201);
  api.logs.length = 0;

  const res = await create();
  expect(res.status).toBe(500);
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  expect(await res.text()).toBe('{"type":"about:blank","title":"Internal Server Error","status":500}');
  expect(api.logs).toContainEqual(expect.stringContaining('(P2002)'));
  const logged = api.logs.join('\n');
  for (const secret of ['f00d', 'Unique constraint', 'owner_id', OWNER_A]) {
    expect(logged).not.toContain(secret);
  }
});
