import { UnauthorizedException } from '@nestjs/common';
import {
  createIdentityProvider,
  OWNER_A,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type IdentityProvider,
} from '../../test/support/identity-provider.js';
import { TokenVerifier } from './token-verifier.js';

let idp: IdentityProvider;
let verifier: TokenVerifier;

beforeAll(async () => {
  idp = await createIdentityProvider();
  verifier = new TokenVerifier({ issuer: TEST_ISSUER, audience: TEST_AUDIENCE }, idp.keySet);
});

describe('TokenVerifier', () => {
  it('returns the sub of a valid token', async () => {
    await expect(verifier.verify(await idp.tokens.ownerA())).resolves.toMatchObject({ sub: OWNER_A });
  });

  it('returns the exp of a valid token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const token = await idp.tokenFor(OWNER_A, { exp });
    await expect(verifier.verify(token)).resolves.toEqual({ sub: OWNER_A, exp });
  });

  it('accepts a token signed by either published key', async () => {
    await expect(verifier.verify(await idp.tokens.secondKey())).resolves.toMatchObject({ sub: OWNER_A });
  });

  it('accepts a token that expired within the clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await idp.tokenFor(OWNER_A, { exp: now - 5 });
    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: OWNER_A });
  });

  it('accepts a single-string audience', async () => {
    const token = await idp.tokenFor(OWNER_A, { aud: TEST_AUDIENCE });
    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: OWNER_A });
  });

  it.each([
    'expired',
    'wrongAudience',
    'wrongIssuer',
    'issuerWithoutSlash',
    'noSub',
    'emptySub',
    'hs256',
    'ps256',
    'none',
    'unknownKey',
  ] as const)('rejects a %s token with a 401', async (kind) => {
    const token = await idp.tokens[kind]();
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['', 'not-a-jwt', 'a.b.c'])('rejects the garbage token %j with a 401', async (token) => {
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that expired beyond the clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await idp.tokenFor(OWNER_A, { exp: now - 120 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
