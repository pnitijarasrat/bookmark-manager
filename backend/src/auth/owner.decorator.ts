import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Where the guard leaves the verified `sub`, and the token it came from.
export const OWNER_KEY = Symbol('owner');
export const TOKEN_KEY = Symbol('token');

/** The caller's verified access token, and its `exp` in epoch seconds. */
export type AccessToken = { value: string; exp: number };

export type AuthenticatedRequest = Request & {
  [OWNER_KEY]?: string;
  [TOKEN_KEY]?: AccessToken;
};

/**
 * The caller's Owner, as set by the token guard. Controllers pass it on
 * explicitly, as the first argument of every service and repository call.
 */
export const Owner = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const owner = ctx.switchToHttp().getRequest<AuthenticatedRequest>()[OWNER_KEY];
  // The global guard always sets it, so this only fires on a wiring mistake.
  if (!owner) throw new Error('@Owner() used on a request the token guard did not check');
  return owner;
});

/**
 * The caller's verified access token, for the one route that passes it on:
 * `/me`, which sends it to Auth0's `/userinfo`. Never log or return it.
 */
export const VerifiedAccessToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessToken => {
    const token = ctx.switchToHttp().getRequest<AuthenticatedRequest>()[TOKEN_KEY];
    if (!token) throw new Error('@VerifiedAccessToken() used on a request the token guard did not check');
    return token;
  },
);
