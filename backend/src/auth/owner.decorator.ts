import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Where the guard leaves the verified `sub`.
export const OWNER_KEY = Symbol('owner');

export type AuthenticatedRequest = Request & { [OWNER_KEY]?: string };

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
