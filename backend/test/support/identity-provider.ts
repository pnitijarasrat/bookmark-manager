import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
  UnsecuredJWT,
  type JWK,
  type JWTPayload,
} from 'jose';

// A fake identity provider for tests: an in-process JWKS with two published
// keys, and token factories for the good and bad cases. The app under test is
// given this issuer, audience and key set in place of the Auth0 tenant. See
// #10: what stays unproven is fetching the real tenant's keys.

export const TEST_ISSUER = 'https://issuer.test/';
export const TEST_AUDIENCE = 'https://api.test';

export const OWNER_A = 'auth0|aaaaaaaaaaaaaaaaaaaaaaaa';
export const OWNER_B = 'auth0|bbbbbbbbbbbbbbbbbbbbbbbb';

export const TEST_USERINFO_URL = `${TEST_ISSUER}userinfo`;

// The fake /userinfo's answer for an Owner. The email is built from the
// hex part only, so a response containing it never contains the `sub`.
export function profileOf(sub: string) {
  const hex = sub.split('|')[1] ?? 'unknown';
  return {
    sub,
    email: `user-${hex.slice(0, 8)}@example.test`,
    email_verified: true,
    name: `User ${hex.slice(0, 8)}`,
    nickname: 'user',
    picture: 'https://example.test/avatar.png',
    updated_at: '2026-09-16T10:00:00.000Z',
  };
}

export type IdentityProvider = Awaited<ReturnType<typeof createIdentityProvider>>;

export async function createIdentityProvider() {
  const signingKeys = await Promise.all(
    ['key-1', 'key-2'].map(async (kid) => {
      const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
      // Published without `alg`, like Auth0's, so the verifier's own
      // algorithm list is what blocks algorithm confusion.
      const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, use: 'sig' };
      return { kid, privateKey, publicJwk };
    }),
  );
  const [first, second] = signingKeys;
  const jwks = { keys: signingKeys.map((k) => k.publicJwk) };

  const now = () => Math.floor(Date.now() / 1000);

  const sign = (
    payload: JWTPayload,
    { key = first, alg = 'RS256' }: { key?: typeof first; alg?: string } = {},
  ) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg, kid: key.kid, typ: 'JWT' })
      .sign(key.privateKey);

  const claims = (sub: string, overrides: JWTPayload = {}): JWTPayload => ({
    iss: TEST_ISSUER,
    // Auth0 access tokens carry an array audience.
    aud: [TEST_AUDIENCE, TEST_USERINFO_URL],
    sub,
    iat: now(),
    exp: now() + 3600,
    ...overrides,
  });

  const tokenFor = (sub: string, overrides: JWTPayload = {}) => sign(claims(sub, overrides));

  const keySet = createLocalJWKSet(jwks);

  // A stand-in for the tenant's /userinfo, called as `fetch` would be. It
  // answers a token this provider signed with that Owner's profile, which
  // includes `sub` like Auth0's does, and anything else with a 401.
  const userinfo = async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== TEST_USERINFO_URL) throw new Error(`Unexpected fetch to ${String(input)}`);
    const token = /^Bearer (.+)$/.exec(new Headers(init?.headers).get('authorization') ?? '')?.[1];
    try {
      const { payload } = await jwtVerify(token ?? '', keySet, { issuer: TEST_ISSUER });
      return Response.json(profileOf(payload.sub!));
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
  };

  return {
    keySet,
    userinfo,
    tokenFor,
    tokens: {
      ownerA: () => tokenFor(OWNER_A),
      ownerB: () => tokenFor(OWNER_B),
      secondKey: () => sign(claims(OWNER_A), { key: second }),
      expired: () => tokenFor(OWNER_A, { iat: now() - 7200, exp: now() - 3600 }),
      wrongAudience: () => tokenFor(OWNER_A, { aud: 'https://other-api.test' }),
      wrongIssuer: () => tokenFor(OWNER_A, { iss: 'https://evil.test/' }),
      issuerWithoutSlash: () => tokenFor(OWNER_A, { iss: TEST_ISSUER.slice(0, -1) }),
      noSub: () => sign({ ...claims(OWNER_A), sub: undefined }),
      emptySub: () => tokenFor(''),
      // Signed with the first key's public JWK as the HMAC secret.
      hs256: async () =>
        new SignJWT(claims(OWNER_A))
          .setProtectedHeader({ alg: 'HS256', kid: first.kid })
          .sign(new TextEncoder().encode(JSON.stringify(first.publicJwk))),
      // A valid RSA signature from the published key, but with PSS padding.
      ps256: async () => {
        const pss = await importJWK(
          { ...(await exportJWK(first.privateKey)), alg: 'PS256' },
          'PS256',
        );
        return new SignJWT(claims(OWNER_A))
          .setProtectedHeader({ alg: 'PS256', kid: first.kid })
          .sign(pss);
      },
      none: async () => new UnsecuredJWT(claims(OWNER_A)).encode(),
      // Signed by a key the provider never published.
      unknownKey: async () => {
        const { privateKey } = await generateKeyPair('RS256');
        return new SignJWT(claims(OWNER_A))
          .setProtectedHeader({ alg: 'RS256', kid: first.kid })
          .sign(privateKey);
      },
    },
  };
}
