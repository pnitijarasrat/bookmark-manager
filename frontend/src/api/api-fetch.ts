import createClient, { type Client } from 'openapi-fetch';
import { redirect, type RouterContextProvider } from 'react-router';
import { pathOf } from '../auth/require-auth';
import { loginPath } from '../auth/return-to';
import { authContext, SessionEndedError } from '../auth/session';
import { config } from '../config';
import type { paths } from './schema';

export type ApiClient = Client<paths>;

export interface DataArgs {
  request: Request;
  context: Readonly<RouterContextProvider>;
}

interface Options {
  /**
   * Error statuses the caller handles itself, e.g. a 422 in an action, or
   * `'all'` for every one. A 401 is never returned.
   */
  allow?: number[] | 'all';
}

/**
 * The one way the SPA calls the API. It attaches the Bearer token, sends an
 * ended session (a {@link SessionEndedError} or a 401) to
 * `/login?reason=expired`, and throws every other error status the caller
 * doesn't `allow` to the route error boundary. See DECISIONS.md, "An expired
 * session sends the user back to `/login`" and "How errors are shown".
 */
export async function apiFetch<R extends { response: Response }>(
  { request, context }: DataArgs,
  call: (client: ApiClient) => Promise<R>,
  { allow = [] }: Options = {},
): Promise<R> {
  const session = context.get(authContext);
  const expired = async () => {
    await session.clearSession();
    return redirect(loginPath(pathOf(request), 'expired'));
  };

  let token: string;
  try {
    token = await session.getAccessToken();
  } catch (error) {
    // Anything else, e.g. a network failure, is shown like a failed API call.
    throw error instanceof SessionEndedError ? await expired() : error;
  }

  const client = createClient<paths>({
    baseUrl: config.apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    signal: request.signal,
    // Read `fetch` on each call, so tests can stub it.
    fetch: (input) => globalThis.fetch(input),
  });
  const result = await call(client);
  const { status } = result.response;

  if (status === 401) throw await expired();
  if (result.response.ok || allow === 'all' || allow.includes(status)) return result;
  throw errorResponse(status);
}

/** A thrown error Response, which the route error boundary shows. */
export function errorResponse(status: number): Response {
  return new Response(null, { status });
}
