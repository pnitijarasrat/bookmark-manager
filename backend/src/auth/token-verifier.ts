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

/**
 * Checks an Auth0 access token and returns its `sub`, the Owner. Every
 * failure is the same 401, whatever the reason. See DECISIONS.md, "How the
 * API checks the access token".
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly rules: TokenRules,
    @Inject(JWKS) private readonly keySet: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.keySet, {
        algorithms: ['RS256'],
        issuer: this.rules.issuer,
        audience: this.rules.audience,
        requiredClaims: ['exp'],
        clockTolerance: CLOCK_TOLERANCE,
      });
      if (typeof payload.sub === 'string' && payload.sub !== '') return payload.sub;
    } catch {
      // Falls through to the 401 below.
    }
    throw new UnauthorizedException();
  }
}
