import { sessionContext, type AuthSession } from '../auth/session';

export const FAKE_TOKEN = 'fake-access-token';

/** A signed-in session. Like the real one, clearSession signs it out. */
export function fakeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  const session: AuthSession = {
    isAuthenticated: true,
    getAccessToken: vi.fn(async () => FAKE_TOKEN),
    clearSession: vi.fn(async () => {
      session.isAuthenticated = false;
    }),
    ...overrides,
  };
  return session;
}

export const contextWith = sessionContext;

/** Loader and action arguments for a request to the SPA at `path`. */
export function dataArgs(
  path: string,
  {
    form,
    params = {},
    session = fakeSession(),
  }: {
    form?: Record<string, string>;
    params?: Record<string, string>;
    session?: AuthSession;
  } = {},
) {
  const url = new URL(path, 'http://localhost:3000');
  const request = new Request(
    url,
    form ? { method: 'POST', body: new URLSearchParams(form) } : undefined,
  );
  return { request, url, params, context: contextWith(session), pattern: '' };
}

/** Awaits `promise` and returns what it threw. Fails if it resolved. */
export async function thrownBy(promise: unknown): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}
