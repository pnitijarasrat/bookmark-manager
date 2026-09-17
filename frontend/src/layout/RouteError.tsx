import { Alert, Button, Link, Stack, Typography } from '@mui/material';
import {
  isRouteErrorResponse,
  Link as RouterLink,
  useLocation,
  useRevalidator,
  useRouteError,
} from 'react-router';

/**
 * The route error boundary. A 404 means "not found or not yours", and the page
 * says nothing about which. See DECISIONS.md, "How errors are shown".
 */
export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <Alert
      severity="error"
      action={
        <Button
          color="inherit"
          loading={revalidator.state === 'loading'}
          onClick={() => revalidator.revalidate()}
        >
          Try again
        </Button>
      }
    >
      Something went wrong loading this page.
    </Alert>
  );
}

function NotFound() {
  const { pathname } = useLocation();
  const list = pathname.startsWith('/collections')
    ? { to: '/collections', label: 'Collections' }
    : { to: '/bookmarks', label: 'Bookmarks' };

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Not found
      </Typography>
      <Typography>There's nothing here.</Typography>
      <Link component={RouterLink} to={list.to}>
        Back to {list.label}
      </Link>
    </Stack>
  );
}
