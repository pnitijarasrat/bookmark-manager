import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { safeReturnTo } from './auth/return-to';
import { auth0Session } from './auth/auth0-session';
import { sessionContext } from './auth/session';
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
  // StrictMode calls a state initializer twice, and a router starts loading as
  // soon as it's made. So the initializer only returns a getter, and just the
  // kept one makes a router.
  const [router] = useState(() =>
    once(() => {
      const session = auth0Session({
        isAuthenticated,
        getAccessTokenSilently: () => getAccessTokenSilently(),
        logout,
      });
      return createBrowserRouter(routes, { getContext: () => sessionContext(session) });
    }),
  );
  return <RouterProvider router={router()} />;
}

function once<T>(make: () => T): () => T {
  let value: { made: T } | undefined;
  return () => (value ??= { made: make() }).made;
}
