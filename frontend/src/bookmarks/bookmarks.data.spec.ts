import { data as withStatus } from 'react-router';
import { SessionEndedError } from '../auth/session';
import { mockApi, noContent, problem, type MockApi } from '../test/mock-api';
import { aBookmark, aCollection, page } from '../test/fixtures';
import { dataArgs, fakeSession, thrownBy } from '../test/session';
import { bookmarkAction, bookmarkLoader, bookmarksAction, bookmarksLoader } from './bookmarks.data';

const COLLECTION_ID = aCollection().id;
const BOOKMARK_ID = aBookmark().id;

describe('bookmarksLoader', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
    api.on('GET', '/bookmarks', () => page([aBookmark()], 'next-1'));
    api.on('GET', '/collections', () => page([aCollection()]));
  });

  it('loads the first page and every Collection for the picker', async () => {
    const data = await bookmarksLoader(dataArgs('/bookmarks'));

    expect(data.page).toEqual({ items: [aBookmark()], nextCursor: 'next-1' });
    expect(data.collections).toEqual([aCollection()]);
    const bookmarksCall = api.calls.find((c) => c.path.startsWith('/bookmarks'));
    expect(bookmarksCall?.path).toBe('/bookmarks');
  });

  it('passes the URL filters on to the API and ignores empty ones', async () => {
    await bookmarksLoader(dataArgs(`/bookmarks?q=post&collectionId=${COLLECTION_ID}`));
    await bookmarksLoader(dataArgs('/bookmarks?q=&collectionId=none'));

    const [first, second] = api.calls.filter((c) => c.path.startsWith('/bookmarks'));
    expect(Object.fromEntries(first.searchParams)).toEqual({
      q: 'post',
      collectionId: COLLECTION_ID,
    });
    expect(Object.fromEntries(second.searchParams)).toEqual({ collectionId: 'none' });
  });

  it('follows the cursor through every page of Collections', async () => {
    api.on('GET', '/collections', ({ searchParams }) =>
      searchParams.get('cursor') === 'c-2'
        ? page([aCollection({ id: 'b', name: 'Second' })])
        : page([aCollection({ id: 'a', name: 'First' })], 'c-2'),
    );

    const data = await bookmarksLoader(dataArgs('/bookmarks'));

    expect(data.collections?.map((c) => c.name)).toEqual(['First', 'Second']);
    const collectionCalls = api.calls.filter((c) => c.path.startsWith('/collections'));
    expect(collectionCalls.map((c) => c.searchParams.get('limit'))).toEqual(['100', '100']);
  });

  it('loads only the next page for Load more', async () => {
    const data = await bookmarksLoader(dataArgs('/bookmarks?q=post&cursor=next-1'));

    expect(data.collections).toBeNull();
    expect(api.calls).toHaveLength(1);
    expect(Object.fromEntries(api.calls[0].searchParams)).toEqual({
      q: 'post',
      cursor: 'next-1',
    });
  });

  it('throws a 404 when the Collection filter is not found', async () => {
    api.on('GET', '/bookmarks', () => problem(404));

    const thrown = await thrownBy(
      bookmarksLoader(dataArgs(`/bookmarks?collectionId=${COLLECTION_ID}`)),
    );

    expect((thrown as Response).status).toBe(404);
  });

  it('sends an expired session to /login', async () => {
    const session = fakeSession({
      getAccessToken: async () => {
        throw new SessionEndedError();
      },
    });

    const thrown = await thrownBy(bookmarksLoader(dataArgs('/bookmarks?q=a', { session })));

    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fbookmarks%3Fq%3Da&reason=expired',
    );
  });
});

describe('bookmarksAction (create)', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
  });

  const form = {
    url: 'https://example.com/post',
    title: 'A post',
    notes: 'Read later',
    collectionId: '',
  };

  it('creates an Uncategorised Bookmark when no Collection is picked', async () => {
    api.on('POST', '/bookmarks', () => Response.json(aBookmark(), { status: 201 }));

    const result = await bookmarksAction(dataArgs('/bookmarks', { form }));

    expect(result).toEqual({ ok: true });
    expect(api.calls[0].body).toEqual({ ...form, collectionId: null });
  });

  it('sends the picked Collection', async () => {
    api.on('POST', '/bookmarks', () => Response.json(aBookmark(), { status: 201 }));

    await bookmarksAction(
      dataArgs('/bookmarks', { form: { ...form, collectionId: COLLECTION_ID } }),
    );

    expect(api.calls[0].body).toMatchObject({ collectionId: COLLECTION_ID });
  });

  it('returns 422 errors next to their fields', async () => {
    api.on('POST', '/bookmarks', () =>
      problem(422, {
        errors: [
          { pointer: '/url', detail: 'must be an http or https URL' },
          { pointer: '/title', detail: 'must not be empty' },
        ],
      }),
    );

    const result = await bookmarksAction(dataArgs('/bookmarks', { form }));

    expect(result).toEqual(
      withStatus(
        {
          ok: false,
          fieldErrors: { url: 'Must be an http or https URL', title: 'Must not be empty' },
        },
        { status: 422 },
      ),
    );
  });

  it('shows "Collection not found" on the picker for a 404', async () => {
    api.on('POST', '/bookmarks', () => problem(404));

    const result = await bookmarksAction(
      dataArgs('/bookmarks', { form: { ...form, collectionId: COLLECTION_ID } }),
    );

    expect(result).toEqual(
      withStatus(
        {
          ok: false,
          fieldErrors: { collectionId: 'Collection not found' },
        },
        { status: 404 },
      ),
    );
  });

  it('throws a 404 for an Uncategorised create, which names no Collection', async () => {
    api.on('POST', '/bookmarks', () => problem(404));

    const thrown = await thrownBy(bookmarksAction(dataArgs('/bookmarks', { form })));

    expect((thrown as Response).status).toBe(404);
  });

  it('returns any other failure as a form error', async () => {
    api.on('POST', '/bookmarks', () => problem(500));

    const result = await bookmarksAction(dataArgs('/bookmarks', { form }));

    expect(result).toEqual(
      withStatus(
        {
          ok: false,
          fieldErrors: {},
          formError: expect.any(String),
        },
        { status: 500 },
      ),
    );
  });

  it('returns a network failure as a form error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await bookmarksAction(dataArgs('/bookmarks', { form }));

    expect(result).toMatchObject({
      data: { ok: false, formError: expect.any(String) },
      init: { status: 503 },
    });
  });
});

describe('bookmarkLoader', () => {
  it('loads the Bookmark', async () => {
    const api = mockApi();
    api.on('GET', `/bookmarks/${BOOKMARK_ID}`, () => Response.json(aBookmark()));

    const data = await bookmarkLoader(
      dataArgs(`/bookmarks/${BOOKMARK_ID}`, { params: { id: BOOKMARK_ID } }),
    );

    expect(data).toEqual({ bookmark: aBookmark() });
  });

  it('throws a 404 for a Bookmark that is not found', async () => {
    const api = mockApi();
    api.on('GET', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));

    const thrown = await thrownBy(
      bookmarkLoader(dataArgs(`/bookmarks/${BOOKMARK_ID}`, { params: { id: BOOKMARK_ID } })),
    );

    expect((thrown as Response).status).toBe(404);
  });
});

describe('bookmarkAction', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
  });

  const path = `/bookmarks/${BOOKMARK_ID}?q=post`;
  const update = {
    intent: 'update',
    url: 'https://example.com/new',
    title: 'New title',
    notes: '',
    collectionId: COLLECTION_ID,
  };
  const args = (form: Record<string, string>) =>
    dataArgs(path, { form, params: { id: BOOKMARK_ID } });

  it('replaces the Bookmark with PUT and goes back to the filtered list', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () => Response.json(aBookmark()));

    const result = await bookmarkAction(args(update));

    expect(api.calls[0].method).toBe('PUT');
    expect(api.calls[0].body).toEqual({
      url: update.url,
      title: update.title,
      notes: '',
      collectionId: COLLECTION_ID,
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe('/bookmarks?q=post');
  });

  it('sends "None" as collectionId: null', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () => Response.json(aBookmark()));

    await bookmarkAction(args({ ...update, collectionId: '' }));

    expect(api.calls[0].body).toMatchObject({ collectionId: null });
  });

  it('shows "Collection not found" when the 404 was the Collection', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));
    api.on('GET', `/bookmarks/${BOOKMARK_ID}`, () => Response.json(aBookmark()));

    const result = await bookmarkAction(args(update));

    expect(result).toEqual(
      withStatus(
        {
          ok: false,
          fieldErrors: { collectionId: 'Collection not found' },
        },
        { status: 404 },
      ),
    );
  });

  it('throws a 404 when the Bookmark itself is not found', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));
    api.on('GET', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));

    const thrown = await thrownBy(bookmarkAction(args(update)));

    expect((thrown as Response).status).toBe(404);
  });

  it('throws a 404 for an Uncategorised save that is not found', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));

    const thrown = await thrownBy(bookmarkAction(args({ ...update, collectionId: '' })));

    expect((thrown as Response).status).toBe(404);
    expect(api.calls).toHaveLength(1);
  });

  it('returns 422 errors next to their fields', async () => {
    api.on('PUT', `/bookmarks/${BOOKMARK_ID}`, () =>
      problem(422, { errors: [{ pointer: '/title', detail: 'must not be empty' }] }),
    );

    const result = await bookmarkAction(args(update));

    expect(result).toEqual(
      withStatus({ ok: false, fieldErrors: { title: 'Must not be empty' } }, { status: 422 }),
    );
  });

  it('deletes the Bookmark and goes back to the filtered list', async () => {
    api.on('DELETE', `/bookmarks/${BOOKMARK_ID}`, () => noContent());

    const result = await bookmarkAction(args({ intent: 'delete' }));

    expect(api.calls[0].method).toBe('DELETE');
    expect((result as Response).headers.get('Location')).toBe('/bookmarks?q=post');
  });

  it('throws a 404 when the Bookmark to delete is not found', async () => {
    api.on('DELETE', `/bookmarks/${BOOKMARK_ID}`, () => problem(404));

    const thrown = await thrownBy(bookmarkAction(args({ intent: 'delete' })));

    expect((thrown as Response).status).toBe(404);
  });

  it('rejects an unknown intent', async () => {
    const thrown = await thrownBy(bookmarkAction(args({ intent: 'archive' })));

    expect((thrown as Response).status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });
});
