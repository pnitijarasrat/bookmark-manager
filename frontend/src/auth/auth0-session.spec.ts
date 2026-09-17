import { GenericError, MissingRefreshTokenError, TimeoutError } from '@auth0/auth0-react';
import { auth0Session } from './auth0-session';
import { SessionEndedError } from './session';

function sessionWith(getAccessTokenSilently: () => Promise<string>) {
  const logout = vi.fn(async () => {});
  const session = auth0Session({ isAuthenticated: true, getAccessTokenSilently, logout });
  return { session, logout };
}

describe('auth0Session', () => {
  it('returns the access token', async () => {
    const { session } = sessionWith(async () => 'token');

    await expect(session.getAccessToken()).resolves.toBe('token');
  });

  it.each([
    ['login_required', new GenericError('login_required', 'Login required')],
    ['consent_required', new GenericError('consent_required', 'Consent required')],
    ['interaction_required', new GenericError('interaction_required', 'Interaction required')],
    ['a missing refresh token', new MissingRefreshTokenError('openid', 'https://api')],
    ['an OAuth error object', { error: 'login_required' }],
  ])('reports an ended session for %s', async (_, error) => {
    const { session } = sessionWith(async () => {
      throw error;
    });

    await expect(session.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });

  it('reports an ended session when Auth0 gives no token', async () => {
    const { session } = sessionWith(async () => '');

    await expect(session.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });

  it.each([
    ['a timeout', new TimeoutError()],
    ['a network failure', new TypeError('Failed to fetch')],
    ['another Auth0 error', new GenericError('server_error', 'Oops')],
  ])('passes %s on, since the session may still be valid', async (_, error) => {
    const { session } = sessionWith(async () => {
      throw error;
    });

    await expect(session.getAccessToken()).rejects.toBe(error);
  });

  it('signs out locally without leaving the app', async () => {
    const { session, logout } = sessionWith(async () => 'token');

    await session.clearSession();

    expect(session.isAuthenticated).toBe(false);
    expect(logout).toHaveBeenCalledWith({ openUrl: false });
  });
});
