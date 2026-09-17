import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { safeReturnTo } from './auth/return-to';
import { sessionContext, type AuthSession } from './auth/session';
import { config } from './config';
import { FullPageSpinner } from './layout/FullPageSpinner';
import { routes } from './routes';
import { theme } from './theme';

/**
 * Auth0 (PKCE, in-memory token cache) around the router. See DECISIONS.md,
 * "How the SPA is wired up and the login page".
 */
export function App() {
  return (
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/callback`,
        audience: config.auth0Audience,
        scope: 'openid profile email',
      }}
      // Runs before the router exists, so the router starts on the right page.
      onRedirectCallback={(appState) =>
        window.history.replaceState(null, '', safeReturnTo(appState?.returnTo))
      }
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthRouter />
      </ThemeProvider>
    </Auth0Provider>
  );
}

/** Waits for Auth0, so the guard never sees a half-loaded session. */
function AuthRouter() {
  const { isLoading } = useAuth0();
  return isLoading ? <FullPageSpinner /> : <SessionRouter />;
}

function SessionRouter() {
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0();
  // Created once. Signing in always leaves the page, so the only change the
  // session sees while the router lives is ending, and clearSession records it.
  const [router] = useState(() => {
    const session: AuthSession = {
      isAuthenticated,
      getAccessToken: async () => {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error('No access token');
        return token;
      },
      clearSession: async () => {
        session.isAuthenticated = false;
        await logout({ openUrl: false });
      },
    };
    return createBrowserRouter(routes, { getContext: () => sessionContext(session) });
  });
  return <RouterProvider router={router} />;
}
