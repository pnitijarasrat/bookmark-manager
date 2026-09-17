import { SessionEndedError, type AuthSession } from './session';

/**
 * Auth0 error codes that mean only signing in again gets a token. Any other
 * failure, like a timeout or a network error, leaves the session alone.
 */
const SESSION_ENDED = new Set([
  'login_required',
  'consent_required',
  'interaction_required',
  'missing_refresh_token',
  'invalid_grant',
]);

/** The parts of `useAuth0()` the session needs. */
interface Auth0 {
  isAuthenticated: boolean;
  getAccessTokenSilently: () => Promise<string | undefined>;
  logout: (options: { openUrl: false }) => Promise<void>;
}

/**
 * The {@link AuthSession} the router passes to loaders and actions. It's made
 * once, with the router, so `clearSession` records the only change the session
 * sees while the router lives: signing in always leaves the page.
 */
export function auth0Session({
  isAuthenticated,
  getAccessTokenSilently,
  logout,
}: Auth0): AuthSession {
  const session: AuthSession = {
    isAuthenticated,
    getAccessToken: async () => {
      let token: string | undefined;
      try {
        token = await getAccessTokenSilently();
      } catch (error) {
        throw isSessionEnded(error) ? new SessionEndedError() : error;
      }
      if (!token) throw new SessionEndedError();
      return token;
    },
    clearSession: async () => {
      session.isAuthenticated = false;
      await logout({ openUrl: false });
    },
  };
  return session;
}

function isSessionEnded(error: unknown): boolean {
  const code = (error as { error?: unknown } | null)?.error;
  return typeof code === 'string' && SESSION_ENDED.has(code);
}
