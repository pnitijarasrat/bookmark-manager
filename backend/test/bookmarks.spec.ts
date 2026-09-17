import { expectInvalid, expectNotFound, expectProblem, startApi, type Api } from './support/api.js';

// The /bookmarks routes and GET /collections/:id/bookmarks, end to end.
// Cross-Owner cases are in isolation.spec.ts. See API_DESIGN.md §2, §4 and §5.

let api: Api;
let token: string;

beforeAll(async () => {
  api = await startApi();
});

afterAll(async () => {
  await api?.stop();
});

beforeEach(async () => {
  ({ token } = await api.owner());
});

type Bookmark = {
  id: string;
  url: string;
  title: string;
  notes: string;
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

const valid = { url: 'https://example.com/post', title: 'A post' };

const post = (body: unknown) => api.send('POST', '/bookmarks', token, body);

async function created(body: object = {}): Promise<Bookmark> {
  const res = await post({ ...valid, ...body });
  expect(res.status).toBe(201);
  return res.json();
}

async function collection(name = 'Reading'): Promise<string> {
  const res = await api.send('POST', '/collections', token, { name });
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

async function page(path: string) {
  const res = await api.request(path, { token });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Bookmark[]; nextCursor: string | null };
}

const titles = async (path: string) => (await page(path)).items.map((b) => b.title);

describe('POST /bookmarks', () => {
  it('creates an Uncategorised Bookmark with empty notes by default', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      ...valid,
      notes: '',
      collectionId: null,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: body.createdAt,
    });
    expect(res.headers.get('location')).toBe(`/bookmarks/${body.id}`);
  });

  it('creates a Bookmark in a Collection, with notes', async () => {
    const collectionId = await collection();
    const body = await created({ notes: '  kept as sent\n', collectionId });
    expect(body).toMatchObject({ notes: '  kept as sent\n', collectionId });
  });

  it('accepts collectionId: null', async () => {
    expect((await created({ collectionId: null })).collectionId).toBeNull();
  });

  it('trims url and title, and otherwise stores the url as entered', async () => {
    const body = await created({ url: '  HTTP://Example.COM/a/../b?x#frag ', title: ' A post ' });
    expect(body).toMatchObject({ url: 'HTTP://Example.COM/a/../b?x#frag', title: 'A post' });
  });

  it('allows the same url twice', async () => {
    const [first, second] = [await created(), await created()];
    expect(first.id).not.toBe(second.id);
  });

  it('accepts the maximum lengths', async () => {
    const url = `https://e.test/${'x'.repeat(2048 - 'https://e.test/'.length)}`;
    const body = await created({ url, title: 't'.repeat(200), notes: 'n'.repeat(2000) });
    expect(body.url).toHaveLength(2048);
  });

  it.each([
    ['a javascript: url', { url: 'javascript:alert(1)' }, ['/url']],
    ['a data: url', { url: 'data:text/html,hi' }, ['/url']],
    ['an ftp url', { url: 'ftp://example.com' }, ['/url']],
    ['a relative url', { url: '/just/a/path' }, ['/url']],
    ['a url with no host', { url: 'http://' }, ['/url']],
    ['a whitespace url', { url: '   ' }, ['/url']],
    ['a url over 2048 chars', { url: `https://e.test/${'x'.repeat(2034)}` }, ['/url']],
    ['a numeric url', { url: 42 }, ['/url']],
    ['an empty title', { title: '' }, ['/title']],
    ['a whitespace title', { title: '  ' }, ['/title']],
    ['a title over 200 chars', { title: 't'.repeat(201) }, ['/title']],
    ['notes over 2000 chars', { notes: 'n'.repeat(2001) }, ['/notes']],
    ['null notes', { notes: null }, ['/notes']],
    ['a malformed collectionId', { collectionId: 'nope' }, ['/collectionId']],
    ['a numeric collectionId', { collectionId: 1 }, ['/collectionId']],
    ['several bad fields', { url: 'mailto:x@y.z', title: '' }, ['/url', '/title']],
  ])('refuses %s with a 422', async (_, change, pointers) => {
    await expectInvalid(await post({ ...valid, ...change }), pointers);
  });

  it('requires url and title', async () => {
    await expectInvalid(await post({}), ['/url', '/title']);
  });

  it('answers a collectionId that does not exist with the constant 404', async () => {
    await expectNotFound(await post({ ...valid, collectionId: crypto.randomUUID() }));
  });

  it.each(['id', 'ownerId', 'createdAt', 'updatedAt', 'collection'])(
    'refuses %s in the body with a 400',
    async (field) => {
      await expectProblem(await post({ ...valid, [field]: 'x' }), 400);
    },
  );

  it('refuses a body that is not JSON with a 415', async () => {
    const res = await api.request('/bookmarks', {
      method: 'POST',
      token,
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(valid),
    });
    await expectProblem(res, 415);
  });
});

describe('GET /bookmarks/:id', () => {
  it('returns the Bookmark', async () => {
    const bookmark = await created();
    const res = await api.request(`/bookmarks/${bookmark.id}`, { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(bookmark);
  });

  it('answers a malformed ID with the constant 404', async () => {
    await expectNotFound(await api.request('/bookmarks/nope', { token }));
  });
});

describe('PUT /bookmarks/:id', () => {
  const put = (id: string, body: unknown) => api.send('PUT', `/bookmarks/${id}`, token, body);

  it('replaces every field', async () => {
    const collectionId = await collection();
    const bookmark = await created({ notes: 'old' });
    const replacement = { url: 'http://new.test', title: 'New', notes: '', collectionId };
    const res = await put(bookmark.id, replacement);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ...replacement, id: bookmark.id, createdAt: bookmark.createdAt });
    expect(body.updatedAt > bookmark.updatedAt).toBe(true);
  });

  it('moves the Bookmark to Uncategorised with collectionId: null', async () => {
    const bookmark = await created({ collectionId: await collection() });
    const res = await put(bookmark.id, { ...valid, notes: '', collectionId: null });
    expect((await res.json()).collectionId).toBeNull();
  });

  it('requires all four fields, collectionId included', async () => {
    const bookmark = await created();
    await expectInvalid(await put(bookmark.id, {}), ['/url', '/title', '/notes', '/collectionId']);
    await expectInvalid(await put(bookmark.id, { ...valid, notes: '' }), ['/collectionId']);
  });

  it('never creates a Bookmark', async () => {
    await expectNotFound(await put(crypto.randomUUID(), { ...valid, notes: '', collectionId: null }));
  });

  it('answers a missing collectionId with the constant 404, and changes nothing', async () => {
    const bookmark = await created();
    await expectNotFound(await put(bookmark.id, { ...valid, notes: 'x', collectionId: crypto.randomUUID() }));
    expect(await (await api.request(`/bookmarks/${bookmark.id}`, { token })).json()).toEqual(bookmark);
  });
});

describe('PATCH /bookmarks/:id', () => {
  const patch = (id: string, body: unknown) => api.send('PATCH', `/bookmarks/${id}`, token, body);

  it('changes only the fields sent', async () => {
    const bookmark = await created({ notes: 'keep' });
    const res = await patch(bookmark.id, { title: ' Renamed ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...bookmark, title: 'Renamed', updatedAt: expect.any(String) });
  });

  it('moves the Bookmark in and out of a Collection', async () => {
    const collectionId = await collection();
    const bookmark = await created();
    expect((await (await patch(bookmark.id, { collectionId })).json()).collectionId).toBe(collectionId);
    expect((await (await patch(bookmark.id, { collectionId: null })).json()).collectionId).toBeNull();
  });

  it('treats {} as a 200 that changes only updatedAt', async () => {
    const bookmark = await created();
    const res = await patch(bookmark.id, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect({ ...body, updatedAt: bookmark.updatedAt }).toEqual(bookmark);
    expect(body.updatedAt > bookmark.updatedAt).toBe(true);
  });

  it('refuses null for any field but collectionId with a 422', async () => {
    const bookmark = await created();
    const res = await patch(bookmark.id, { url: null, title: null, notes: null });
    await expectInvalid(res, ['/url', '/title', '/notes']);
  });

  it('validates the fields it is sent', async () => {
    const bookmark = await created();
    await expectInvalid(await patch(bookmark.id, { url: 'javascript:x', title: '' }), ['/url', '/title']);
  });

  it('refuses an unknown field with a 400', async () => {
    const bookmark = await created();
    await expectProblem(await patch(bookmark.id, { ownerId: 'x' }), 400);
  });
});

describe('DELETE /bookmarks/:id', () => {
  it('answers 204, then 404', async () => {
    const bookmark = await created();
    const remove = () => api.request(`/bookmarks/${bookmark.id}`, { method: 'DELETE', token });
    const res = await remove();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    await expectNotFound(await remove());
    await expectNotFound(await api.request(`/bookmarks/${bookmark.id}`, { token }));
  });

  it('updates the Collection count', async () => {
    const collectionId = await collection();
    const bookmark = await created({ collectionId });
    await api.request(`/bookmarks/${bookmark.id}`, { method: 'DELETE', token });
    const res = await api.request(`/collections/${collectionId}`, { token });
    expect((await res.json()).bookmarkCount).toBe(0);
  });
});

describe('GET /bookmarks', () => {
  it('lists newest first', async () => {
    for (const title of ['one', 'two', 'three']) await created({ title });
    expect(await titles('/bookmarks')).toEqual(['three', 'two', 'one']);
  });

  it('pages through every Bookmark exactly once, including ties on createdAt', async () => {
    // Created in parallel, so some share a millisecond.
    const made = await Promise.all(Array.from({ length: 9 }, (_, i) => created({ title: `b${i}` })));
    const expected = made
      .toSorted((x, y) => (x.createdAt === y.createdAt ? (x.id < y.id ? 1 : -1) : x.createdAt < y.createdAt ? 1 : -1))
      .map((b) => b.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body: { items: Bookmark[]; nextCursor: string | null } = await page(
        `/bookmarks?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...body.items.map((b) => b.id));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected);
  });

  it('filters by Collection, or by Uncategorised with none', async () => {
    const reading = await collection('Reading');
    const later = await collection('Later');
    await created({ title: 'r', collectionId: reading });
    await created({ title: 'l', collectionId: later });
    await created({ title: 'u' });
    expect(await titles(`/bookmarks?collectionId=${reading}`)).toEqual(['r']);
    expect(await titles('/bookmarks?collectionId=none')).toEqual(['u']);
    expect(await titles('/bookmarks')).toEqual(['u', 'l', 'r']);
  });

  it.each(['NONE', 'null', '', 'nope', '123'])(
    'answers the collectionId filter %j with the constant 404',
    async (value) => {
      await expectNotFound(await api.request(`/bookmarks?collectionId=${value}`, { token }));
    },
  );

  it('answers a collectionId filter for a missing Collection with the constant 404', async () => {
    await expectNotFound(await api.request(`/bookmarks?collectionId=${crypto.randomUUID()}`, { token }));
  });

  it('answers a deleted Collection filter with the constant 404', async () => {
    const reading = await collection();
    await api.request(`/collections/${reading}`, { method: 'DELETE', token });
    await expectNotFound(await api.request(`/bookmarks?collectionId=${reading}`, { token }));
  });

  it('searches title and url with q, ignoring case', async () => {
    await created({ title: 'Rust book', url: 'https://a.test' });
    await created({ title: 'Other', url: 'https://RUST-lang.test' });
    await created({ title: 'Notes only', notes: 'rust' });
    expect(await titles('/bookmarks?q=rust')).toEqual(['Other', 'Rust book']);
  });

  it('matches %, _ and \\ in q literally', async () => {
    for (const title of ['50% off', '500 off', 'snake_case', 'snakeXcase', 'a\\b', 'ab']) {
      await created({ title });
    }
    const search = (q: string) => titles(`/bookmarks?q=${encodeURIComponent(q)}`);
    expect(await search('0%')).toEqual(['50% off']);
    expect(await search('e_c')).toEqual(['snake_case']);
    expect(await search('a\\')).toEqual(['a\\b']);
  });

  it('combines q with the Collection filter', async () => {
    const reading = await collection();
    await created({ title: 'match in', collectionId: reading });
    await created({ title: 'match out' });
    await created({ title: 'other in', collectionId: reading });
    expect(await titles(`/bookmarks?collectionId=${reading}&q=MATCH`)).toEqual(['match in']);
    expect(await titles('/bookmarks?collectionId=none&q=match')).toEqual(['match out']);
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=x',
    'cursor=%%%',
    'cursor=' + Buffer.from('{"createdAt":"yesterday","id":"x"}').toString('base64url'),
    'cursor=' + Buffer.from('{"name":"a","id":"00000000-0000-4000-8000-000000000000"}').toString('base64url'),
    'q=' + 'x'.repeat(201),
    'collectionId=none&collectionId=none',
    'page=2',
  ])('refuses ?%s with a 400', async (query) => {
    await expectProblem(await api.request(`/bookmarks?${query}`, { token }), 400);
  });
});

describe('GET /collections/:id/bookmarks', () => {
  it('lists the Bookmarks in the Collection, like the collectionId filter', async () => {
    const reading = await collection();
    for (const title of ['a', 'b', 'c']) await created({ title, collectionId: reading });
    await created({ title: 'elsewhere' });

    const nested = await page(`/collections/${reading}/bookmarks?limit=2&q=%20`);
    const filtered = await page(`/bookmarks?collectionId=${reading}&limit=2`);
    expect(nested).toEqual(filtered);
    expect(nested.items.map((b) => b.title)).toEqual(['c', 'b']);

    const rest = await page(`/collections/${reading}/bookmarks?limit=2&cursor=${nested.nextCursor}`);
    expect(rest).toEqual({ items: [expect.objectContaining({ title: 'a' })], nextCursor: null });
  });

  it('searches with q', async () => {
    const reading = await collection();
    await created({ title: 'keep', collectionId: reading });
    await created({ title: 'skip', collectionId: reading });
    expect(await titles(`/collections/${reading}/bookmarks?q=KEE`)).toEqual(['keep']);
  });

  it('refuses a collectionId parameter with a 400', async () => {
    const reading = await collection();
    const res = await api.request(`/collections/${reading}/bookmarks?collectionId=none`, { token });
    await expectProblem(res, 400);
  });

  it.each(['nope', crypto.randomUUID()])('answers the Collection %s with the constant 404', async (id) => {
    await expectNotFound(await api.request(`/collections/${id}/bookmarks`, { token }));
  });
});
