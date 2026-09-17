import { useAuth0 } from '@auth0/auth0-react';
import {
  AppBar,
  Box,
  Button,
  Container,
  LinearProgress,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link, Outlet, useLocation, useNavigation } from 'react-router';

const TABS = [
  { label: 'Bookmarks', to: '/bookmarks' },
  { label: 'Collections', to: '/collections' },
];

/** The layout of every protected page. See DECISIONS.md, "The app shell". */
export function AppShell() {
  const { logout } = useAuth0();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const current = TABS.find((tab) => pathname.startsWith(tab.to))?.to ?? false;

  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="span">
            Bookmark Manager
          </Typography>
          <Tabs value={current} textColor="inherit" indicatorColor="secondary">
            {TABS.map((tab) => (
              <Tab key={tab.to} label={tab.label} value={tab.to} component={Link} to={tab.to} />
            ))}
          </Tabs>
          <Box sx={{ flexGrow: 1 }} />
          {/* The signed-in email from /me goes here (slice 6, #6). */}
          <Button
            color="inherit"
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            Sign out
          </Button>
        </Toolbar>
        {navigation.state !== 'idle' && <LinearProgress color="secondary" />}
      </AppBar>
      <Container component="main" maxWidth="md" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}
