import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expectNotFound, NOT_FOUND, startApi, type Api } from './support/api.js';

// The proof of isolation, end to end with real tokens and real Postgres. The
// expected results come from the matrix table in API_DESIGN.md §6, so the doc
// and the tests can't disagree. See #10.

let api: Api;

beforeAll(async () => {
  api = await startApi();
});

afterAll(async () => {
  await api?.stop();
});

// ---------------------------------------------------------------------------
// The table

const COLUMNS = ['own', 'other', 'missing', 'malformed', 'noToken'] as const;
type Column = (typeof COLUMNS)[number];

type Row = { route: string; varies: string; expected: Partial<Record<Column, string>> };

function readMatrix(): Row[] {
  const doc = readFileSync(new URL('../../API_DESIGN.md', import.meta.url), 'utf8');
  const table = /<!-- cross-owner-matrix:start -->\n([\s\S]*?)<!-- cross-owner-matrix:end -->/.exec(doc);
  if (!table) throw new Error('API_DESIGN.md has no cross-owner matrix');
  return table[1]
    .trim()
    .split('\n')
    .slice(2) // the header and the separator
    .map((line) => {
      const [route, varies, ...cells] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll('`', ''));
      if (cells.length !== COLUMNS.length) throw new Error(`Malformed matrix row: ${line}`);
      const expected = Object.fromEntries(
        COLUMNS.map((column, i) => [column, cells[i]]).filter(([, cell]) => cell !== '—'),
      );
      return { route, varies, expected };
    });
}

const MATRIX = readMatrix();

// ---------------------------------------------------------------------------
// The world each cell runs in: two fresh Owners, each with one Collection
// holding one Bookmark.

type Side = {
  sub: string;
  token: string;
  collection: { id: string; name: string };
  bookmark: { id: string };
};
type World = { a: Side; b: Side };

async function side(label: string): Promise<Side> {
  const { sub, token } = await api.owner();
  const collection = await (
    await api.send('POST', '/collections', token, { name: `${label}'s shelf` })
  ).json();
  const bookmark = await (
    await api.send('POST', '/bookmarks', token, {
      url: `https://${label.toLowerCase()}.test`,
      title: `${label}'s link`,
      collectionId: collection.id,
    })
  ).json();
  return { sub, token, collection, bookmark };
}

// Everything an Owner can see. Includes updatedAt, so any write shows up.
async function snapshot({ token }: Side) {
  const [collections, bookmarks] = await Promise.all(
    ['/collections?limit=100', '/bookmarks?limit=100'].map(async (path) => {
      const res = await api.request(path, { token });
      expect(res.status).toBe(200);
      return (await res.json()).items;
    }),
  );
  return { collections, bookmarks };
}

// ---------------------------------------------------------------------------
// How each row names its target. The caller is always A; `token` is
// undefined in the No token column.

type Target = Exclude<Column, 'noToken'>;
type Call = (world: World, target: Target, token: string | undefined) => Promise<Response>;

// The id of a Collection or Bookmark for each kind of target.
const idOf = (world: World, target: Target, kind: 'collection' | 'bookmark') =>
  ({
    own: world.a[kind].id,
    other: world.b[kind].id,
    missing: randomUUID(),
    malformed: 'not-a-uuid',
  })[target];

const bookmarkBody = { url: 'https://new.test', title: 'New', notes: '' };

const CALLS: Record<string, Call> = {
  // The fake /userinfo answers with A's profile, `sub` included, which the
  // secret check below proves /me drops.
  'GET /me | the caller': (_, __, token) => api.request('/me', { token }),
  'GET /collections | the list': (_, __, token) => api.request('/collections?limit=100', { token }),
  'POST /collections | the name already in use': (world, target, token) =>
    api.send('POST', '/collections', token, {
      name: (target === 'own' ? world.a : world.b).collection.name.toUpperCase(),
    }),
  'GET /collections/:id | path :id': (world, target, token) =>
    api.request(`/collections/${idOf(world, target, 'collection')}`, { token }),
  'PUT /collections/:id | path :id': (world, target, token) =>
    api.send('PUT', `/collections/${idOf(world, target, 'collection')}`, token, { name: 'Renamed' }),
  'PATCH /collections/:id | path :id': (world, target, token) =>
    api.send('PATCH', `/collections/${idOf(world, target, 'collection')}`, token, { name: 'Renamed' }),
  'DELETE /collections/:id | path :id': (world, target, token) =>
    api.request(`/collections/${idOf(world, target, 'collection')}`, { method: 'DELETE', token }),
  'GET /collections/:id/bookmarks | path :id': (world, target, token) =>
    api.request(`/collections/${idOf(world, target, 'collection')}/bookmarks`, { token }),
  'GET /bookmarks | the list': (_, __, token) => api.request('/bookmarks?limit=100', { token }),
  'GET /bookmarks | ?collectionId=': (world, target, token) =>
    api.request(`/bookmarks?collectionId=${idOf(world, target, 'collection')}`, { token }),
  'POST /bookmarks | body collectionId': (world, target, token) =>
    api.send('POST', '/bookmarks', token, {
      ...bookmarkBody,
      collectionId: idOf(world, target, 'collection'),
    }),
  'GET /bookmarks/:id | path :id': (world, target, token) =>
    api.request(`/bookmarks/${idOf(world, target, 'bookmark')}`, { token }),
  'PUT /bookmarks/:id | path :id': (world, target, token) =>
    api.send('PUT', `/bookmarks/${idOf(world, target, 'bookmark')}`, token, {
      ...bookmarkBody,
      collectionId: null,
    }),
  'PUT /bookmarks/:id | body collectionId': (world, target, token) =>
    api.send('PUT', `/bookmarks/${world.a.bookmark.id}`, token, {
      ...bookmarkBody,
      collectionId: idOf(world, target, 'collection'),
    }),
  'PATCH /bookmarks/:id | path :id': (world, target, token) =>
    api.send('PATCH', `/bookmarks/${idOf(world, target, 'bookmark')}`, token, { title: 'Changed' }),
  'PATCH /bookmarks/:id | body collectionId': (world, target, token) =>
    api.send('PATCH', `/bookmarks/${world.a.bookmark.id}`, token, {
      collectionId: idOf(world, target, 'collection'),
    }),
  'DELETE /bookmarks/:id | path :id': (world, target, token) =>
    api.request(`/bookmarks/${idOf(world, target, 'bookmark')}`, { method: 'DELETE', token }),
};

const keyOf = (row: Row) => `${row.route} | ${row.varies}`;

// ---------------------------------------------------------------------------

describe('the cross-Owner matrix', () => {
  it('has a test for every row, and a row for every test', () => {
    expect(MATRIX.map(keyOf).toSorted()).toEqual(Object.keys(CALLS).toSorted());
  });

  it('lists every route the app serves', () => {
    const stack = (api.app.getHttpAdapter().getInstance() as { router: { stack: RouterLayer[] } })
      .router.stack;
    const served = stack
      .flatMap((layer) =>
        layer.route
          ? Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path}`)
          : [],
      )
      .filter((route) => !route.startsWith('_ALL') && !route.startsWith('HEAD'));
    expect(new Set(served)).toEqual(new Set(MATRIX.map((row) => row.route)));
  });

  const cells = MATRIX.flatMap((row) =>
    Object.entries(row.expected).map(([column, cell]) => ({ row, column: column as Column, cell: cell! })),
  );

  it.each(cells)('$row.route ($row.varies), $column: $cell', async ({ row, column, cell }) => {
    const world = { a: await side('A'), b: await side('B') };
    const before = { a: await snapshot(world.a), b: await snapshot(world.b) };

    const target = column === 'noToken' ? 'own' : column;
    const token = column === 'noToken' ? undefined : world.a.token;
    const res = await CALLS[keyOf(row)](world, target, token);

    const status = Number(cell.split(',')[0]);
    expect(res.status).toBe(status);
    const text = await res.text();
    if (status === 404) expect(text).toBe(NOT_FOUND);
    for (const secret of ['ownerId', 'owner_id', world.a.sub, world.b.sub]) {
      expect(text).not.toContain(secret);
    }

    if (cell.endsWith('not listed')) {
      const ids = JSON.parse(text).items.map((item: { id: string }) => item.id);
      const [mine, theirs] = row.route === 'GET /collections'
        ? [world.a.collection.id, world.b.collection.id]
        : [world.a.bookmark.id, world.b.bookmark.id];
      expect(ids).toContain(mine);
      expect(ids).not.toContain(theirs);
    }

    expect(await snapshot(world.b)).toEqual(before.b);
    if (status >= 300) expect(await snapshot(world.a)).toEqual(before.a);
  });
});

type RouterLayer = { route?: { path: string; methods: Record<string, boolean> } };

// ---------------------------------------------------------------------------
// Deleting a Collection keeps its Bookmarks: tests 1–4 from #9. Test 5 is in
// migrations.spec.ts.

describe('deleting a Collection (#9)', () => {
  const remove = (side: Side, id: string) =>
    api.request(`/collections/${id}`, { method: 'DELETE', token: side.token });

  it("1: A's own non-empty Collection is deleted, and its Bookmarks become Uncategorised", async () => {
    const a = await side('A');
    const second = await (
      await api.send('POST', '/bookmarks', a.token, {
        url: 'https://two.test',
        title: 'Two',
        collectionId: a.collection.id,
      })
    ).json();

    const before = await snapshot(a);

    const res = await remove(a, a.collection.id);
    expect(res.status).toBe(204);

    // Still A's, now Uncategorised, and otherwise untouched: updatedAt too.
    for (const id of [a.bookmark.id, second.id]) {
      const bookmark = await api.request(`/bookmarks/${id}`, { token: a.token });
      expect(bookmark.status).toBe(200);
      const was = before.bookmarks.find((b: { id: string }) => b.id === id);
      expect(await bookmark.json()).toEqual({ ...was, collectionId: null });
    }
    const uncategorised = await (
      await api.request('/bookmarks?collectionId=none', { token: a.token })
    ).json();
    expect(uncategorised.items.map((b: { id: string }) => b.id).toSorted()).toEqual(
      [a.bookmark.id, second.id].toSorted(),
    );
  });

  it("2: B deleting A's Collection gets the constant 404, and A's data is unchanged", async () => {
    const [a, b] = [await side('A'), await side('B')];
    const before = await snapshot(a);
    await expectNotFound(await remove(b, a.collection.id));
    expect(await snapshot(a)).toEqual(before);
  });

  it("3: deleting A's Collection leaves B's Collections and Bookmarks unchanged", async () => {
    const [a, b] = [await side('A'), await side('B')];
    const before = await snapshot(b);
    expect((await remove(a, a.collection.id)).status).toBe(204);
    expect(await snapshot(b)).toEqual(before);
  });

  it('4: a second DELETE of the same ID, and a non-UUID ID, get the constant 404', async () => {
    const a = await side('A');
    expect((await remove(a, a.collection.id)).status).toBe(204);
    await expectNotFound(await remove(a, a.collection.id));
    await expectNotFound(await remove(a, 'not-a-uuid'));
  });
});

// ---------------------------------------------------------------------------

it('answers an unmapped database error with a bare 500, and logs no details', async () => {
  const a = await side('A');
  api.logs.length = 0;
  // Postgres refuses a NUL byte in text, and nothing maps that error.
  const res = await api.send('POST', '/bookmarks', a.token, {
    url: 'https://nul.test',
    title: 'f00d\u0000',
  });
  expect(res.status).toBe(500);
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  expect(await res.text()).toBe('{"type":"about:blank","title":"Internal Server Error","status":500}');
  expect(api.logs).toContainEqual(expect.stringMatching(/^Unexpected /));
  const logged = api.logs.join('\n');
  for (const secret of ['f00d', 'nul.test', '0x00', 'invalid byte', a.sub]) {
    expect(logged).not.toContain(secret);
  }
});
