/** Where `/`, `/callback` and a signed-in `/login` send the User. */
export const DEFAULT_ROUTE = '/bookmarks';

export const LOGIN_ROUTE = '/login';
const PUBLIC_PATHS = [LOGIN_ROUTE, '/callback'];
const BASE = 'http://app.invalid';

/**
 * Returns `value` only if it's a relative path inside the app, so a crafted
 * `returnTo` can't send the User to another site. Anything else, including the
 * public routes, becomes {@link DEFAULT_ROUTE}.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return DEFAULT_ROUTE;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return DEFAULT_ROUTE;
  }
  // "//host" and "/\host" are protocol-relative and leave the origin.
  if (url.origin !== BASE || /^\/[/\\]/.test(value)) return DEFAULT_ROUTE;
  if (PUBLIC_PATHS.includes(url.pathname)) return DEFAULT_ROUTE;
  return value;
}

export function loginPath(returnTo: string, reason?: 'expired'): string {
  const params = new URLSearchParams({ returnTo });
  if (reason) params.set('reason', reason);
  return `${LOGIN_ROUTE}?${params}`;
}
