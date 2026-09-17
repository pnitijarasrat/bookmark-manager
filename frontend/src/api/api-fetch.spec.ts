import { contextWith, FAKE_TOKEN, fakeSession, thrownBy } from '../test/session';
import { mockApi, problem, type MockApi } from '../test/mock-api';
import { apiFetch } from './api-fetch';

const PAGE_URL = 'http://localhost:3000/bookmarks?q=post';

function args(session = fakeSession()) {
  return { request: new Request(PAGE_URL), context: contextWith(session) };
}

describe('apiFetch', () => {
  let api: MockApi;
  beforeEach(() => {
    api = mockApi();
  });

  it('sends the Bearer token and returns the data', async () => {
    api.on('GET', '/collections/c1', () => Response.json({ id: 'c1', name: 'Reading' }));

    const { data } = await apiFetch(args(), (client) =>
      client.GET('/collections/{id}', { params: { path: { id: 'c1' } } }),
    );

    expect(data).toEqual({ id: 'c1', name: 'Reading' });
    expect(api.calls[0].url).toBe('http://localhost:3001/collections/c1');
    expect(api.calls[0].headers.get('Authorization')).toBe(`Bearer ${FAKE_TOKEN}`);
  });

  it('sends the User to /login?reason=expired when the token getter throws', async () => {
    const session = fakeSession({
      getAccessToken: vi.fn(async () => {
        throw new Error('login_required');
      }),
    });

    const thrown = await thrownBy(apiFetch(args(session), (client) => client.GET('/collections')));

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fbookmarks%3Fq%3Dpost&reason=expired',
    );
    expect(session.clearSession).toHaveBeenCalledOnce();
    expect(api.calls).toHaveLength(0);
  });

  it('sends the User to /login?reason=expired on a 401', async () => {
    api.on('GET', '/collections', () => problem(401));
    const session = fakeSession();

    const thrown = await thrownBy(apiFetch(args(session), (client) => client.GET('/collections')));

    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fbookmarks%3Fq%3Dpost&reason=expired',
    );
    expect(session.clearSession).toHaveBeenCalledOnce();
  });

  it('throws a 404 response for the error boundary', async () => {
    api.on('GET', '/collections/c1', () => problem(404));

    const thrown = await thrownBy(
      apiFetch(args(), (client) =>
        client.GET('/collections/{id}', { params: { path: { id: 'c1' } } }),
      ),
    );

    expect((thrown as Response).status).toBe(404);
  });

  it('throws a 5xx response for the error boundary', async () => {
    api.on('GET', '/collections', () => problem(500));

    const thrown = await thrownBy(apiFetch(args(), (client) => client.GET('/collections')));

    expect((thrown as Response).status).toBe(500);
  });

  it('returns an allowed error status to the caller', async () => {
    api.on('POST', '/collections', () => problem(409));

    const { error, response } = await apiFetch(
      args(),
      (client) => client.POST('/collections', { body: { name: 'Reading' } }),
      { allow: [409, 422] },
    );

    expect(response.status).toBe(409);
    expect(error).toMatchObject({ status: 409 });
  });

  it('returns every error status but 401 when all are allowed', async () => {
    api.on('GET', '/collections', () => problem(500));

    const { response } = await apiFetch(args(), (client) => client.GET('/collections'), {
      allow: 'all',
    });

    expect(response.status).toBe(500);
  });

  it('never returns a 401, even when allowed', async () => {
    api.on('GET', '/collections', () => problem(401));

    const thrown = await thrownBy(
      apiFetch(args(), (client) => client.GET('/collections'), { allow: [401] }),
    );

    expect((thrown as Response).headers.get('Location')).toContain('reason=expired');
  });
});
