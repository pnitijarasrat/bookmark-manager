import { useAuth0 } from '@auth0/auth0-react';
import { Alert, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { redirect, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { DEFAULT_ROUTE, LOGIN_ROUTE, safeReturnTo } from '../auth/return-to';
import { authContext } from '../auth/session';

export function loginLoader({ context }: LoaderFunctionArgs) {
  if (context.get(authContext).isAuthenticated) throw redirect(DEFAULT_ROUTE);
  return null;
}

/** Auth0 has already handled the callback by the time the router runs. */
export function callbackLoader({ context }: LoaderFunctionArgs) {
  return redirect(context.get(authContext).isAuthenticated ? DEFAULT_ROUTE : LOGIN_ROUTE);
}

/** The password is entered on Universal Login, never here. */
export function LoginPage() {
  const [params] = useSearchParams();
  const { loginWithRedirect } = useAuth0();
  const [leaving, setLeaving] = useState(false);

  const signIn = () => {
    setLeaving(true);
    loginWithRedirect({ appState: { returnTo: safeReturnTo(params.get('returnTo')) } }).catch(() =>
      setLeaving(false),
    );
  };

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            Bookmark Manager
          </Typography>
          {params.get('reason') === 'expired' && (
            <Alert severity="info">Your session expired, sign in again</Alert>
          )}
          <Button variant="contained" size="large" loading={leaving} onClick={signIn}>
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
