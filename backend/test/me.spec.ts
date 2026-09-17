import { randomUUID } from 'node:crypto';
import { expectProblem } from './support/api.js';
import { startApp, type TestApp } from './support/app.js';
import {
  createIdentityProvider,
  OWNER_A,
  OWNER_B,
  profileOf,
  TEST_USERINFO_URL,
  type IdentityProvider,
} from './support/identity-provider.js';

// GET /me, with a stubbed Auth0 /userinfo and no database behind it. See
// DECISIONS.md, "/me comes from /userinfo, cached until the token expires".

let idp: IdentityProvider;
let api: TestApp;
let userinfo: ReturnType<typeof vi.fn<typeof fetch>>;

beforeAll(async () => {
  idp = await createIdentityProvider();
  userinfo = vi.fn<typeof fetch>();
  api = await startApp({ idp, userinfo });
});

beforeEach(() => {
  userinfo.mockReset();
  userinfo.mockImplementation(idp.userinfo);
});

afterAll(async () => {
  await api?.close();
});

const now = () => Math.floor(Date.now() / 1000);

// Tokens signed in the same second are identical, so each gets its own `jti`
// to keep one test's cache entry out of the next.
const uniqueToken = (sub: string, claims: Record<string, unknown> = {}) =>
  idp.tokenFor(sub, { jti: randomUUID(), ...claims });

describe('GET /me', () => {
  it("returns the caller's email, name and picture, and nothing else", async () => {
    const res = await api.request('/me', { token: await uniqueToken(OWNER_A) });

    expect(res.status).toBe(200);
    const text = await res.text();
    const { email, name, picture } = profileOf(OWNER_A);
    expect(JSON.parse(text)).toStrictEqual({ email, name, picture });
    expect(text).not.toContain(OWNER_A);
  });

  it('calls /userinfo with the caller’s own Bearer token', async () => {
    const token = await uniqueToken(OWNER_A);
    await api.request('/me', { token });

    expect(userinfo).toHaveBeenCalledTimes(1);
    const [url, init] = userinfo.mock.calls[0];
    expect(String(url)).toBe(TEST_USERINFO_URL);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
  });

  it('answers each token with its own Owner’s profile', async () => {
    const res = await api.request('/me', { token: await uniqueToken(OWNER_B) });
    expect((await res.json()).email).toBe(profileOf(OWNER_B).email);
  });

  it('returns null for each field /userinfo leaves out or sends as a non-string', async () => {
    userinfo.mockResolvedValue(Response.json({ sub: OWNER_A, name: 42 }));
    const res = await api.request('/me', { token: await uniqueToken(OWNER_A) });

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ email: null, name: null, picture: null });
  });

  it('refuses a request with no token, without calling /userinfo', async () => {
    await expectProblem(await api.request('/me'), 401);
    expect(userinfo).not.toHaveBeenCalled();
  });

  it('refuses an invalid token, without calling /userinfo', async () => {
    await expectProblem(await api.request('/me', { token: await idp.tokens.expired() }), 401);
    expect(userinfo).not.toHaveBeenCalled();
  });
});

describe('the /userinfo cache', () => {
  it('serves repeat calls with the same token from the cache', async () => {
    const token = await uniqueToken(OWNER_A);
    const first = await (await api.request('/me', { token })).json();
    const second = await (await api.request('/me', { token })).json();

    expect(second).toEqual(first);
    expect(userinfo).toHaveBeenCalledTimes(1);
  });

  it('shares one /userinfo call between concurrent requests with the same token', async () => {
    const token = await uniqueToken(OWNER_A);
    const responses = await Promise.all([1, 2, 3].map(() => api.request('/me', { token })));

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(userinfo).toHaveBeenCalledTimes(1);
  });

  it('calls /userinfo again for a different token of the same Owner', async () => {
    await api.request('/me', { token: await uniqueToken(OWNER_A) });
    await api.request('/me', { token: await uniqueToken(OWNER_A) });

    expect(userinfo).toHaveBeenCalledTimes(2);
  });

  it('keeps an entry only until the token expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const token = await uniqueToken(OWNER_A, { exp: now() + 60 });
      await api.request('/me', { token });
      // Past `exp`, but within the verifier's clock tolerance, so the token
      // still passes the guard.
      vi.setSystemTime(Date.now() + 61_000);
      await api.request('/me', { token });

      expect(userinfo).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never caches a failure', async () => {
    const token = await uniqueToken(OWNER_A);
    userinfo.mockResolvedValueOnce(new Response('busy', { status: 503 }));

    expect((await api.request('/me', { token })).status).toBe(502);
    expect((await api.request('/me', { token })).status).toBe(200);
    expect(userinfo).toHaveBeenCalledTimes(2);
  });
});

describe('a /userinfo failure', () => {
  it.each([
    ['a 500', () => new Response('oops', { status: 500 })],
    ['a 429', () => new Response('slow down', { status: 429 })],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['a JSON body that is not an object', () => Response.json(['x'])],
  ])('is a problem+json 502 on %s', async (_, reply) => {
    userinfo.mockImplementation(async () => reply());
    const res = await api.request('/me', { token: await uniqueToken(OWNER_A) });

    expect(await expectProblem(res, 502)).toEqual({
      type: 'about:blank',
      title: 'Bad Gateway',
      status: 502,
    });
  });

  it('is a problem+json 502 when /userinfo cannot be reached', async () => {
    userinfo.mockRejectedValue(new TypeError('fetch failed: getaddrinfo ENOTFOUND secret-host'));
    const res = await api.request('/me', { token: await uniqueToken(OWNER_A) });

    await expectProblem(res, 502);
    expect(api.logs.join('\n')).not.toContain('secret-host');
  });

  it('is a problem+json 401 when Auth0 no longer accepts the token', async () => {
    userinfo.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const res = await api.request('/me', { token: await uniqueToken(OWNER_A) });

    await expectProblem(res, 401);
  });

  it('never logs the token', async () => {
    const token = await uniqueToken(OWNER_A);
    userinfo.mockResolvedValue(new Response('oops', { status: 500 }));
    await api.request('/me', { token });

    expect(api.logs.join('\n')).not.toContain(token);
  });
});
