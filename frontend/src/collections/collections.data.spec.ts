import { aBookmark, aCollection, page } from '../test/fixtures';
import { mockApi, noContent, problem, type MockApi } from '../test/mock-api';
import { dataArgs, thrownBy } from '../test/session';
import {
  collectionAction,
  collectionLoader,
  collectionsAction,
  collectionsLoader,
} from './collections.data';

const ID = aCollection().id;

describe('collectionsLoader', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
    api.on('GET', '/collections', () => page([aCollection()], 'next-1'));
  });

  it('loads the first page', async () => {
    const data = await collectionsLoader(dataArgs('/collections'));

    expect(data).toEqual({ page: { items: [aCollection()], nextCursor: 'next-1' } });
    expect(api.calls[0].path).toBe('/collections');
  });

  it('passes the search and the Load more cursor on to the API', async () => {
    await collectionsLoader(dataArgs('/collections?q=read&cursor=next-1&other=x'));

    expect(Object.fromEntries(api.calls[0].searchParams)).toEqual({
      q: 'read',
      cursor: 'next-1',
    });
  });
});

describe('collectionsAction (create)', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
  });

  it('creates a Collection', async () => {
    api.on('POST', '/collections', () => Response.json(aCollection(), { status: 201 }));

    const result = await collectionsAction(dataArgs('/collections', { form: { name: 'Reading' } }));

    expect(result).toEqual({ ok: true });
    expect(api.calls[0].body).toEqual({ name: 'Reading' });
  });

  it('shows a name already in use next to the name', async () => {
    api.on('POST', '/collections', () => problem(409));

    const result = await collectionsAction(dataArgs('/collections', { form: { name: 'reading' } }));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: 'You already have a Collection with this name' },
    });
  });

  it('returns 422 errors next to their fields', async () => {
    api.on('POST', '/collections', () =>
      problem(422, { errors: [{ pointer: '/name', detail: 'must not be empty' }] }),
    );

    const result = await collectionsAction(dataArgs('/collections', { form: { name: ' ' } }));

    expect(result).toEqual({ ok: false, fieldErrors: { name: 'Must not be empty' } });
  });
});

describe('collectionLoader', () => {
  it('loads the Collection and its Bookmarks', async () => {
    const api = mockApi();
    api.on('GET', `/collections/${ID}`, () => Response.json(aCollection({ bookmarkCount: 1 })));
    api.on('GET', `/collections/${ID}/bookmarks`, () => page([aBookmark({ collectionId: ID })]));

    const data = await collectionLoader(dataArgs(`/collections/${ID}`, { params: { id: ID } }));

    expect(data.collection).toEqual(aCollection({ bookmarkCount: 1 }));
    expect(data.bookmarks).toEqual({
      items: [aBookmark({ collectionId: ID })],
      nextCursor: null,
    });
    const nested = api.calls.find((c) => c.path.includes('/bookmarks'));
    expect(nested?.searchParams.get('limit')).toBe('100');
  });

  it('throws a 404 for a Collection that is not found', async () => {
    const api = mockApi();
    api.on('GET', `/collections/${ID}`, () => problem(404));
    api.on('GET', `/collections/${ID}/bookmarks`, () => problem(404));

    const thrown = await thrownBy(
      collectionLoader(dataArgs(`/collections/${ID}`, { params: { id: ID } })),
    );

    expect((thrown as Response).status).toBe(404);
  });
});

describe('collectionAction', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
  });

  const args = (form: Record<string, string>) =>
    dataArgs(`/collections/${ID}?q=re`, { form, params: { id: ID } });

  it('renames the Collection with PUT and goes back to the list', async () => {
    api.on('PUT', `/collections/${ID}`, () => Response.json(aCollection()));

    const result = await collectionAction(args({ intent: 'rename', name: 'Later' }));

    expect(api.calls[0].body).toEqual({ name: 'Later' });
    expect((result as Response).headers.get('Location')).toBe('/collections?q=re');
  });

  it('shows a name already in use next to the name', async () => {
    api.on('PUT', `/collections/${ID}`, () => problem(409));

    const result = await collectionAction(args({ intent: 'rename', name: 'Later' }));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: 'You already have a Collection with this name' },
    });
  });

  it('throws a 404 when the Collection to rename is not found', async () => {
    api.on('PUT', `/collections/${ID}`, () => problem(404));

    const thrown = await thrownBy(collectionAction(args({ intent: 'rename', name: 'Later' })));

    expect((thrown as Response).status).toBe(404);
  });

  it('deletes the Collection and goes back to the list', async () => {
    api.on('DELETE', `/collections/${ID}`, () => noContent());

    const result = await collectionAction(args({ intent: 'delete' }));

    expect(api.calls[0].method).toBe('DELETE');
    expect((result as Response).headers.get('Location')).toBe('/collections?q=re');
  });

  it('shows a server failure as a form error', async () => {
    api.on('DELETE', `/collections/${ID}`, () => problem(500));

    const result = await collectionAction(args({ intent: 'delete' }));

    expect(result).toMatchObject({ ok: false, formError: expect.any(String) });
  });

  it('rejects an unknown intent', async () => {
    const thrown = await thrownBy(collectionAction(args({ intent: 'share' })));

    expect((thrown as Response).status).toBe(400);
  });
});
