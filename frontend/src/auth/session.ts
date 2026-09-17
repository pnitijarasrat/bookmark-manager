import { createContext, RouterContextProvider } from 'react-router';

/**
 * What loaders, actions and middleware know about the signed-in User. It's
 * passed through the router context (see DECISIONS.md, "How the SPA is wired
 * up"), so tests can hand in a fake.
 */
export interface AuthSession {
  isAuthenticated: boolean;
  /** Resolves to an API access token, or throws if the session has ended. */
  getAccessToken: () => Promise<string>;
  /** Forgets the tokens in memory without leaving the app. */
  clearSession: () => Promise<void>;
}

export const authContext = createContext<AuthSession>();

/** A router context carrying `session`, for `getContext` and for tests. */
export function sessionContext(session: AuthSession): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(authContext, session);
  return context;
}
