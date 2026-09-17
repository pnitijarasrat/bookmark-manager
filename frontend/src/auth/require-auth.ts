import { redirect, type MiddlewareFunction } from 'react-router';
import { loginPath } from './return-to';
import { authContext } from './session';

/**
 * The route guard, on the pathless layout route that holds every protected
 * route. It runs before their loaders, so no loader runs signed out.
 */
export const requireAuth: MiddlewareFunction = async ({ request, context }, next) => {
  if (!context.get(authContext).isAuthenticated) {
    throw redirect(loginPath(pathOf(request)));
  }
  return next();
};

/**
 * The path, query and hash of a router request, for `returnTo`. A `cursor`
 * only comes from a Load more fetcher and never goes in the page URL, so it's
 * left out.
 */
export function pathOf(request: Request): string {
  const url = new URL(request.url);
  url.searchParams.delete('cursor');
  return url.pathname + url.search + url.hash;
}
