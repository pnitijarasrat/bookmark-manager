import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';

// The key set used to check signatures: the tenant's remote JWKS in the app,
// an in-process one in tests.
export const JWKS = Symbol('JWKS');

export abstract class TokenRules {
  abstract readonly issuer: string;
  abstract readonly audience: string;
}

// Seconds of clock skew allowed on `exp`.
const CLOCK_TOLERANCE = 30;

export type VerifiedToken = {
  // The Owner.
  sub: string;
  // When the token expires, in seconds since the epoch.
  exp: number;
};

/**
 * Checks an Auth0 access token and returns its `sub`, the Owner, and `exp`. Every
 * failure is the same 401, whatever the reason. See DECISIONS.md, "How the
 * API checks the access token".
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly rules: TokenRules,
    @Inject(JWKS) private readonly keySet: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.keySet, {
        algorithms: ['RS256'],
        issuer: this.rules.issuer,
        audience: this.rules.audience,
        requiredClaims: ['exp'],
        clockTolerance: CLOCK_TOLERANCE,
      });
      // `requiredClaims` checks that `exp` is present, and jose that it's a number.
      if (typeof payload.sub === 'string' && payload.sub !== '') {
        return { sub: payload.sub, exp: payload.exp! };
      }
    } catch {
      // Falls through to the 401 below.
    }
    throw new UnauthorizedException();
  }
}
