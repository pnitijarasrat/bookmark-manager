import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AccessToken } from '../auth/owner.decorator.js';
import { AppConfig } from '../config/app-config.js';
import type { MeDto } from './me.dto.js';

// How /userinfo is called: the global `fetch` in the app, a stub in tests.
export const USERINFO_FETCH = Symbol('USERINFO_FETCH');

// How long to wait for Auth0 before giving up with a 502.
const TIMEOUT_MS = 5_000;

type Entry = { exp: number; profile: Promise<MeDto> };

/**
 * The caller's profile from Auth0's `/userinfo`, called with the caller's own
 * access token. Auth0 rate-limits `/userinfo`, so each result is kept in
 * memory until its token expires, keyed by the token's SHA-256, and
 * concurrent requests with one token share a call. Failures are never kept.
 * See DECISIONS.md, "/me comes from /userinfo, cached until the token
 * expires".
 */
@Injectable()
export class UserinfoClient {
  private readonly logger = new Logger(UserinfoClient.name);
  private readonly url: string;
  private readonly cache = new Map<string, Entry>();

  constructor(
    config: AppConfig,
    @Inject(USERINFO_FETCH) private readonly fetch: typeof globalThis.fetch,
  ) {
    // The issuer always ends with "/".
    this.url = `${config.auth0.issuer}userinfo`;
  }

  profile(token: AccessToken): Promise<MeDto> {
    const now = Date.now() / 1000;
    this.evictExpired(now);

    const key = createHash('sha256').update(token.value).digest('base64url');
    const hit = this.cache.get(key);
    if (hit) return hit.profile;

    const profile = this.request(token.value);
    // A token past `exp` but inside the verifier's clock tolerance is served
    // without being kept.
    if (token.exp > now) {
      this.cache.set(key, { exp: token.exp, profile });
      profile.catch(() => {
        if (this.cache.get(key)?.profile === profile) this.cache.delete(key);
      });
    }
    return profile;
  }

  // A sweep on every call keeps the map to live tokens only. It holds one
  // entry per signed-in session, so a linear scan is cheap here.
  private evictExpired(now: number) {
    for (const [key, entry] of this.cache) {
      if (entry.exp <= now) this.cache.delete(key);
    }
  }

  private async request(token: string): Promise<MeDto> {
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetch(this.url, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      body = response.ok ? await response.json() : undefined;
    } catch (error) {
      // Only the error's class: a message can name hosts or addresses.
      const name = error instanceof Error ? error.constructor.name : typeof error;
      this.logger.warn(`/userinfo call failed with ${name}`);
      throw new BadGatewayException();
    }

    // Auth0 no longer accepts a token the API just verified, e.g. the
    // session was revoked.
    if (response.status === 401) throw new UnauthorizedException();
    if (!response.ok || typeof body !== 'object' || body === null || Array.isArray(body)) {
      this.logger.warn(`/userinfo answered ${response.status} with an unusable body`);
      throw new BadGatewayException();
    }

    const claims = body as Record<string, unknown>;
    const pick = (field: keyof MeDto) =>
      typeof claims[field] === 'string' ? claims[field] : null;
    // Built field by field, so `sub` and every other claim are left out.
    return { email: pick('email'), name: pick('name'), picture: pick('picture') };
  }
}
