import { expectInvalid, expectNotFound, expectProblem, startApi, type Api } from './support/api.js';

// The /collections routes, end to end. Cross-Owner cases are in
// isolation.spec.ts. See API_DESIGN.md §2, §4 and §5.

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

const create = (name: unknown, as = token) => api.send('POST', '/collections', as, { name });

async function created(name: string) {
  const res = await create(name);
  expect(res.status).toBe(201);
  return res.json();
}

const list = (query = '') => api.request(`/collections${query}`, { token });

describe('POST /collections', () => {
  it('creates a Collection, with a Location header and no ownerId', async () => {
    const res = await create('Reading');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Reading',
      bookmarkCount: 0,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      updatedAt: body.createdAt,
    });
    expect(res.headers.get('location')).toBe(`/collections/${body.id}`);
  });

  it('trims the name', async () => {
    expect((await created('  Reading  ')).name).toBe('Reading');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['over 100 chars', 'x'.repeat(101)],
    ['a number', 5],
    ['null', null],
  ])('refuses a name that is %s with a 422', async (_, name) => {
    await expectInvalid(await create(name), ['/name']);
  });

  it('accepts a name of exactly 100 chars after trimming', async () => {
    expect((await created(` ${'x'.repeat(100)} `)).name).toHaveLength(100);
  });

  it('refuses a missing name with a 422', async () => {
    await expectInvalid(await api.send('POST', '/collections', token, {}), ['/name']);
  });

  it('answers a duplicate name, ignoring case, with a 409', async () => {
    await created('Reading');
    const body = await expectProblem(await create('  rEADING '), 409);
    expect(body).toEqual({ type: 'about:blank', title: 'Conflict', status: 409 });
  });

  it.each(['id', 'ownerId', 'createdAt', 'updatedAt', 'bookmarkCount'])(
    'refuses %s in the body with a 400',
    async (field) => {
      const res = await api.send('POST', '/collections', token, { name: 'Reading', [field]: 'x' });
      await expectProblem(res, 400);
    },
  );

  it.each(['text/plain', 'application/x-www-form-urlencoded'])(
    'refuses a %s body with a 415',
    async (type) => {
      const res = await api.request('/collections', {
        method: 'POST',
        token,
        headers: { 'content-type': type },
        body: 'name=Reading',
      });
      await expectProblem(res, 415);
    },
  );

  it('refuses a body with no content type with a 415', async () => {
    const res = await api.request('/collections', {
      method: 'POST',
      token,
      body: new Uint8Array(Buffer.from('{"name":"Reading"}')),
    });
    await expectProblem(res, 415);
  });

  it('checks the token before the content type', async () => {
    const res = await api.request('/collections', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    await expectProblem(res, 401);
  });
});

describe('GET /collections/:id', () => {
  it('returns the Collection with its Bookmark count', async () => {
    const reading = await created('Reading');
    for (const collectionId of [reading.id, reading.id, null]) {
      await api.send('POST', '/bookmarks', token, { url: 'https://a.test', title: 'A', collectionId });
    }
    const res = await api.request(`/collections/${reading.id}`, { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...reading, bookmarkCount: 2 });
  });

  it.each(['not-a-uuid', '123', `${'0'.repeat(8)}-0000-0000-0000-00000000000g`])(
    'answers the malformed ID %j with the constant 404',
    async (id) => {
      await expectNotFound(await api.request(`/collections/${id}`, { token }));
    },
  );
});

describe.each(['PUT', 'PATCH'])('%s /collections/:id', (method) => {
  it('renames the Collection and moves updatedAt', async () => {
    const reading = await created('Reading');
    const res = await api.send(method, `/collections/${reading.id}`, token, { name: ' Later ' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: reading.id, name: 'Later', createdAt: reading.createdAt });
    expect(body.updatedAt > reading.updatedAt).toBe(true);
  });

  it('allows a change of case to its own name', async () => {
    const reading = await created('Reading');
    const res = await api.send(method, `/collections/${reading.id}`, token, { name: 'READING' });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('READING');
  });

  it("answers another Collection's name with a 409, and changes nothing", async () => {
    await created('Reading');
    const later = await created('Later');
    await expectProblem(await api.send(method, `/collections/${later.id}`, token, { name: 'reading' }), 409);
    expect(await (await api.request(`/collections/${later.id}`, { token })).json()).toEqual(later);
  });

  it.each([null, '', 7])('refuses the name %j with a 422', async (name) => {
    const reading = await created('Reading');
    await expectInvalid(await api.send(method, `/collections/${reading.id}`, token, { name }), ['/name']);
  });

  it('refuses an unknown field with a 400', async () => {
    const reading = await created('Reading');
    const res = await api.send(method, `/collections/${reading.id}`, token, { name: 'x', ownerId: 'x' });
    await expectProblem(res, 400);
  });

  it('refuses a body that is not JSON with a 415', async () => {
    const reading = await created('Reading');
    const res = await api.request(`/collections/${reading.id}`, {
      method,
      token,
      headers: { 'content-type': 'text/plain' },
      body: '{"name":"x"}',
    });
    await expectProblem(res, 415);
  });
});

describe('PUT /collections/:id', () => {
  it('requires the name', async () => {
    const reading = await created('Reading');
    await expectInvalid(await api.send('PUT', `/collections/${reading.id}`, token, {}), ['/name']);
  });
});

describe('PATCH /collections/:id', () => {
  it('treats {} as a 200 that changes only updatedAt', async () => {
    const reading = await created('Reading');
    const res = await api.send('PATCH', `/collections/${reading.id}`, token, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect({ ...body, updatedAt: reading.updatedAt }).toEqual(reading);
    expect(body.updatedAt > reading.updatedAt).toBe(true);
  });
});

describe('DELETE /collections/:id', () => {
  it('answers 204 with no body', async () => {
    const reading = await created('Reading');
    const res = await api.request(`/collections/${reading.id}`, { method: 'DELETE', token });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    await expectNotFound(await api.request(`/collections/${reading.id}`, { token }));
  });

  it('frees the name for reuse', async () => {
    const reading = await created('Reading');
    await api.request(`/collections/${reading.id}`, { method: 'DELETE', token });
    await created('Reading');
  });
});

describe('GET /collections', () => {
  it('lists the Collections by name, ignoring case, then by id', async () => {
    for (const name of ['beta', 'Alpha', 'gamma', 'BETA2']) await created(name);
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((c: { name: string }) => c.name)).toEqual(['Alpha', 'beta', 'BETA2', 'gamma']);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0]).toEqual({
      id: expect.any(String),
      name: 'Alpha',
      bookmarkCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('returns an empty page for an Owner with no Collections', async () => {
    expect(await (await list()).json()).toEqual({ items: [], nextCursor: null });
  });

  it('pages through every Collection exactly once', async () => {
    const names = Array.from({ length: 7 }, (_, i) => `c${i}`);
    for (const name of names.toReversed()) await created(name);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const body = await (await list(query)).json();
      expect(body.items.length).toBeLessThanOrEqual(3);
      seen.push(...body.items.map((c: { name: string }) => c.name));
      cursor = body.nextCursor;
      pages++;
    } while (cursor);
    expect(seen).toEqual(names);
    expect(pages).toBe(3);
  });

  it('gives no next cursor when the last page is exactly full', async () => {
    for (const name of ['a', 'b']) await created(name);
    expect((await (await list('?limit=2')).json()).nextCursor).toBeNull();
  });

  it('defaults to 50 items and allows up to 100', async () => {
    for (let i = 0; i < 101; i++) await created(`n${String(i).padStart(3, '0')}`);
    const first = await (await list()).json();
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect((await (await list('?limit=100')).json()).items).toHaveLength(100);
  });

  it('filters by name with q, ignoring case', async () => {
    for (const name of ['Reading list', 'Later', 'Sheets']) await created(name);
    const body = await (await list('?q=%20READ%20')).json();
    expect(body.items.map((c: { name: string }) => c.name)).toEqual(['Reading list']);
  });

  it('matches %, _ and \\ in q literally', async () => {
    for (const name of ['100% done', '1000 done', 'a_b', 'axb', 'back\\slash', 'backslash']) {
      await created(name);
    }
    const names = async (q: string) =>
      (await (await list(`?q=${encodeURIComponent(q)}`)).json()).items.map((c: { name: string }) => c.name);
    expect(await names('0%')).toEqual(['100% done']);
    expect(await names('a_')).toEqual(['a_b']);
    expect(await names('k\\s')).toEqual(['back\\slash']);
  });

  it('treats an empty q as absent', async () => {
    await created('Reading');
    expect((await (await list('?q=%20%20')).json()).items).toHaveLength(1);
  });

  it.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=abc'],
    ['limit=1.5'],
    ['limit=1e1'],
    ['limit=0x10'],
    ['limit=%205'],
    ['limit='],
    ['limit=1&limit=2'],
    ['cursor=not-a-cursor'],
    ['cursor=' + Buffer.from('{"id":"x"}').toString('base64url')],
    ['cursor=' + Buffer.from('[]').toString('base64url')],
    ['q=' + 'x'.repeat(201)],
    ['q=a&q=b'],
    ['collectionId=none'],
    ['sort=name'],
  ])('refuses ?%s with a 400', async (query) => {
    await expectProblem(await list(`?${query}`), 400);
  });

  it('accepts a q of 200 chars after trimming', async () => {
    expect((await list(`?q=%20${'x'.repeat(200)}%20`)).status).toBe(200);
  });
});
