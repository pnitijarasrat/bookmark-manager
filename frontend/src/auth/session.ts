import { createContext, RouterContextProvider } from 'react-router';

/**
 * What loaders, actions and middleware know about the signed-in User. It's
 * passed through the router context (see DECISIONS.md, "How the SPA is wired
 * up"), so tests can hand in a fake.
 */
export interface AuthSession {
  isAuthenticated: boolean;
  /**
   * Resolves to an API access token. Throws a {@link SessionEndedError} if the
   * session has ended, and any other error if the token couldn't be fetched.
   */
  getAccessToken: () => Promise<string>;
  /** Forgets the tokens in memory without leaving the app. */
  clearSession: () => Promise<void>;
}

/** The session has ended, and only signing in again gets a new token. */
export class SessionEndedError extends Error {
  constructor() {
    super('The session has ended');
    this.name = 'SessionEndedError';
  }
}

export const authContext = createContext<AuthSession>();

/** A router context carrying `session`, for `getContext` and for tests. */
export function sessionContext(session: AuthSession): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(authContext, session);
  return context;
}
