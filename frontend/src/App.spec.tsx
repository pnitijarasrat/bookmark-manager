import { render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { App } from './App';

vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children }: { children: ReactNode }) => children,
  useAuth0: () => ({
    isLoading: false,
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
    loginWithRedirect: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, createBrowserRouter: vi.fn(actual.createBrowserRouter) };
});

describe('App', () => {
  it('creates one router, even when StrictMode renders twice', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(createBrowserRouter).toHaveBeenCalledOnce();
  });
});
