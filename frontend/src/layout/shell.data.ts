import type { LoaderFunctionArgs } from 'react-router';
import { apiFetch } from '../api/api-fetch';

export interface ShellData {
  /** The signed-in User's email, or null if `/me` has none or failed. */
  email: string | null;
}

/**
 * The layout route's loader: the signed-in email from `/me`. A failure only
 * leaves the email out, so the pages still work, but an ended session still
 * goes to `/login`. See DECISIONS.md, "/me comes from /userinfo, cached until
 * the token expires".
 */
export async function shellLoader(args: LoaderFunctionArgs): Promise<ShellData> {
  try {
    const { data } = await apiFetch(args, (client) => client.GET('/me'), { allow: 'all' });
    return { email: data?.email ?? null };
  } catch (error) {
    // A thrown Response is the redirect to `/login`.
    if (error instanceof Response) throw error;
    return { email: null };
  }
}

/**
 * `/me` only changes with the User, and each call costs the API a `/userinfo`
 * lookup, so the shell never reloads it after an action or a navigation.
 */
export const shellShouldRevalidate = () => false;
