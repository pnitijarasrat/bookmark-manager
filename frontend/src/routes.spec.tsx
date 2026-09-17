import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SessionEndedError, type AuthSession } from './auth/session';
import { routes } from './routes';
import { aBookmark, aCollection, page } from './test/fixtures';
import { mockApi, noContent, problem, type MockApi } from './test/mock-api';
import { contextWith, fakeSession } from './test/session';
import { theme } from './theme';

const reading = aCollection({ bookmarkCount: 2 });
const post = aBookmark({ collectionId: reading.id });
const loose = aBookmark({ id: '5c1e0000-0000-4000-8000-000000000002', title: 'Loose link' });
const later = aCollection({ id: '0b9f0000-0000-4000-8000-000000000002', name: 'Later' });

function renderApp(path: string, session: AuthSession = fakeSession()) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    getContext: () => contextWith(session),
  });
  render(
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return { router, user: userEvent.setup() };
}

let api: MockApi;
beforeEach(() => {
  api = mockApi();
  api.on('GET', '/bookmarks', () => page([post, loose]));
  api.on('GET', '/collections', () => page([reading]));
  api.on('GET', `/bookmarks/${post.id}`, () => Response.json(post));
  api.on('GET', `/collections/${reading.id}`, () => Response.json(reading));
  api.on('GET', `/collections/${reading.id}/bookmarks`, () => page([post]));
});

describe('sign-in routes', () => {
  it('sends a signed-out visitor to the login page', async () => {
    const { router } = renderApp('/bookmarks?q=a', fakeSession({ isAuthenticated: false }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?returnTo=%2Fbookmarks%3Fq%3Da');
    expect(api.calls).toHaveLength(0);
  });

  it('sends a signed-out visitor from / to the login page', async () => {
    const { router } = renderApp('/', fakeSession({ isAuthenticated: false }));

    await screen.findByRole('button', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('explains an expired session', async () => {
    renderApp(
      '/login?returnTo=%2Fbookmarks&reason=expired',
      fakeSession({ isAuthenticated: false }),
    );

    expect(await screen.findByText('Your session expired, sign in again')).toBeInTheDocument();
  });

  it('sends a signed-in User from /login to /bookmarks', async () => {
    const { router } = renderApp('/login');

    await screen.findByText('A post');
    expect(router.state.location.pathname).toBe('/bookmarks');
  });

  it('sends / to /bookmarks', async () => {
    const { router } = renderApp('/');

    await screen.findByText('A post');
    expect(router.state.location.pathname).toBe('/bookmarks');
  });

  it('sends an ended session to /login?reason=expired', async () => {
    const session = fakeSession({
      getAccessToken: async () => {
        throw new SessionEndedError();
      },
    });
    const { router } = renderApp('/collections', session);

    expect(await screen.findByText('Your session expired, sign in again')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fcollections&reason=expired');
    expect(session.clearSession).toHaveBeenCalled();
  });

  it('keeps the User signed in when the token request fails for another reason', async () => {
    const session = fakeSession({
      getAccessToken: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { router } = renderApp('/collections', session);

    expect(await screen.findByText('Something went wrong loading this page.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/collections');
    expect(session.clearSession).not.toHaveBeenCalled();
  });

  it('returns to the first page, not the Load more page, after an expiry', async () => {
    api.on('GET', '/bookmarks', ({ searchParams }) =>
      searchParams.get('cursor') ? problem(401) : page([post], 'next-1'),
    );
    const { router, user } = renderApp('/bookmarks?q=o');

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Your session expired, sign in again')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fbookmarks%3Fq%3Do&reason=expired');
  });
});

describe('the app shell', () => {
  it('shows the tabs and Sign out', async () => {
    renderApp('/collections');

    expect(
      await screen.findByRole('tab', { name: 'Collections', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('errors', () => {
  it('shows the Not-found page, inside the shell, for a Bookmark that is not found', async () => {
    api.on('GET', `/bookmarks/${post.id}`, () => problem(404));
    renderApp(`/bookmarks/${post.id}`);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Bookmarks' })).toHaveAttribute(
      'href',
      '/bookmarks',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('shows the Not-found page for a Collection that is not found', async () => {
    api.on('GET', `/collections/${reading.id}`, () => problem(404));
    api.on('GET', `/collections/${reading.id}/bookmarks`, () => problem(404));
    renderApp(`/collections/${reading.id}`);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Collections' })).toBeInTheDocument();
  });

  it('shows the Not-found page for a Collection filter that is not found', async () => {
    api.on('GET', '/bookmarks', () => problem(404));
    renderApp(`/bookmarks?collectionId=${reading.id}`);

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('shows the Not-found page for an unknown path', async () => {
    renderApp('/nowhere');

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('offers Try again after a server error, which reloads the data', async () => {
    let fail = true;
    api.on('GET', '/bookmarks', () => (fail ? problem(500) : page([post])));
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    fail = false;
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('A post')).toBeInTheDocument();
  });
});

describe('/bookmarks', () => {
  it('lists Bookmarks with their Collection', async () => {
    renderApp('/bookmarks');

    const item = (await screen.findByText('A post')).closest('a')!;
    expect(within(item).getByText('Reading')).toBeInTheDocument();
    expect(item).toHaveAttribute('href', `/bookmarks/${post.id}`);
  });

  it('keeps the filters in the URL', async () => {
    const { router, user } = renderApp('/bookmarks');

    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), 'post{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe('?q=post'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Collection' }), 'none');
    await waitFor(() => expect(router.state.location.search).toBe('?q=post&collectionId=none'));

    const listCalls = api.calls.filter((c) => c.path.startsWith('/bookmarks'));
    expect(listCalls.at(-1)?.path).toBe('/bookmarks?q=post&collectionId=none');
  });

  it('adds the next page with Load more', async () => {
    api.on('GET', '/bookmarks', ({ searchParams }) =>
      searchParams.get('cursor') === 'next-1' ? page([loose]) : page([post], 'next-1'),
    );
    const { user } = renderApp('/bookmarks?q=o');

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Loose link')).toBeInTheDocument();
    expect(screen.getByText('A post')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(api.calls.at(-1)?.path).toBe('/bookmarks?q=o&cursor=next-1');
  });

  it('keeps the loaded pages when a save is rejected', async () => {
    api.on('GET', '/bookmarks', ({ searchParams }) =>
      searchParams.get('cursor') === 'next-1' ? page([loose]) : page([post], 'next-1'),
    );
    api.on('PUT', `/bookmarks/${post.id}`, () =>
      problem(422, { errors: [{ pointer: '/title', detail: 'must not be empty' }] }),
    );
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await user.click(await screen.findByText('A post'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    const listLoads = api.calls.filter((c) => c.path.startsWith('/bookmarks?')).length;
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Must not be empty')).toBeInTheDocument();
    expect(screen.getByText('Loose link')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path.startsWith('/bookmarks?'))).toHaveLength(listLoads);
    expect(api.calls.filter((c) => c.path.startsWith('/collections'))).toHaveLength(1);
  });

  it('creates a Bookmark from the New dialog and reloads the list', async () => {
    api.on('POST', '/bookmarks', () => Response.json(loose, { status: 201 }));
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'New bookmark' }));
    const dialog = await screen.findByRole('dialog', { name: 'New bookmark' });
    await user.type(within(dialog).getByLabelText(/URL/), 'https://example.com/x');
    await user.type(within(dialog).getByLabelText(/Title/), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post_ = api.calls.find((c) => c.method === 'POST');
    expect(post_?.body).toEqual({
      url: 'https://example.com/x',
      title: 'X',
      notes: '',
      collectionId: null,
    });
    // The list reloads after the save.
    const listLoads = api.calls.filter((c) => c.method === 'GET' && c.path === '/bookmarks');
    expect(listLoads).toHaveLength(2);
  });

  it('shows "Collection not found" on the picker when a new Bookmark gets a 404', async () => {
    api.on('POST', '/bookmarks', () => problem(404));
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'New bookmark' }));
    const dialog = await screen.findByRole('dialog', { name: 'New bookmark' });
    await user.type(within(dialog).getByLabelText(/URL/), 'https://example.com/x');
    await user.type(within(dialog).getByLabelText(/Title/), 'X');
    await user.selectOptions(within(dialog).getByLabelText('Collection'), reading.id);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Collection not found')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Collection')).toHaveAccessibleDescription(
      'Collection not found',
    );
  });

  it('shows 422 errors next to the fields', async () => {
    api.on('POST', '/bookmarks', () =>
      problem(422, { errors: [{ pointer: '/url', detail: 'must be an http or https URL' }] }),
    );
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'New bookmark' }));
    const dialog = await screen.findByRole('dialog', { name: 'New bookmark' });
    await user.type(within(dialog).getByLabelText(/URL/), 'https://example.com/x');
    await user.type(within(dialog).getByLabelText(/Title/), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Must be an http or https URL')).toBeInTheDocument();
  });

  it('shows any other failure in a Snackbar', async () => {
    api.on('POST', '/bookmarks', () => problem(500));
    const { user } = renderApp('/bookmarks');

    await user.click(await screen.findByRole('button', { name: 'New bookmark' }));
    const dialog = await screen.findByRole('dialog', { name: 'New bookmark' });
    await user.type(within(dialog).getByLabelText(/URL/), 'https://example.com/x');
    await user.type(within(dialog).getByLabelText(/Title/), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server. Try again.',
    );
  });
});

describe('the Bookmark dialog', () => {
  it('opens the edit form over the list', async () => {
    renderApp(`/bookmarks/${post.id}?q=post`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue('A post');
    expect(within(dialog).getByLabelText('Collection')).toHaveValue(reading.id);
    expect(
      within(dialog).getByRole('option', { name: 'None (Uncategorised)' }),
    ).toBeInTheDocument();
    const open = within(dialog).getByRole('link', { name: 'Open link' });
    expect(open).toHaveAttribute('href', post.url);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Loose link')).toBeInTheDocument();
  });

  it('saves with PUT, closes, and keeps the filters', async () => {
    api.on('PUT', `/bookmarks/${post.id}`, () => Response.json(post));
    const { router, user } = renderApp(`/bookmarks/${post.id}?q=post`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    await user.selectOptions(within(dialog).getByLabelText('Collection'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/bookmarks'));
    expect(router.state.location.search).toBe('?q=post');
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      collectionId: null,
    });
  });

  it('shows "Collection not found" on the picker when the 404 was the Collection', async () => {
    api.on('PUT', `/bookmarks/${post.id}`, () => problem(404));
    const { user } = renderApp(`/bookmarks/${post.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Collection not found')).toBeInTheDocument();
  });

  it('shows a failed delete in a Snackbar, closing the confirmation', async () => {
    api.on('DELETE', `/bookmarks/${post.id}`, () => problem(500));
    const { router, user } = renderApp(`/bookmarks/${post.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this bookmark?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server. Try again.',
    );
    expect(screen.queryByRole('dialog', { name: 'Delete this bookmark?' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/bookmarks/${post.id}`);
  });

  it('asks before deleting', async () => {
    api.on('DELETE', `/bookmarks/${post.id}`, () => noContent());
    const { router, user } = renderApp(`/bookmarks/${post.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this bookmark?' });
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/bookmarks'));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('closes back to the list without saving', async () => {
    const { router, user } = renderApp(`/bookmarks/${post.id}?collectionId=none`);

    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/bookmarks'));
    expect(router.state.location.search).toBe('?collectionId=none');
    expect(api.calls.some((c) => c.method !== 'GET')).toBe(false);
  });
});

describe('/collections', () => {
  it('lists Collections with their counts', async () => {
    renderApp('/collections');

    const item = (await screen.findByText('Reading')).closest('a')!;
    expect(within(item).getByText('2 bookmarks')).toBeInTheDocument();
  });

  it('shows a name already in use in the New dialog', async () => {
    api.on('POST', '/collections', () => problem(409));
    const { user } = renderApp('/collections');

    await user.click(await screen.findByRole('button', { name: 'New collection' }));
    const dialog = await screen.findByRole('dialog', { name: 'New collection' });
    await user.type(within(dialog).getByLabelText(/Name/), 'reading');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText('You already have a Collection with this name'),
    ).toBeInTheDocument();
  });

  it('keeps the loaded pages when a new Collection is rejected', async () => {
    api.on('GET', '/collections', ({ searchParams }) =>
      searchParams.get('cursor') === 'next-1' ? page([later]) : page([reading], 'next-1'),
    );
    api.on('POST', '/collections', () => problem(409));
    const { user } = renderApp('/collections');

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await screen.findByText('Later');
    await user.click(screen.getByRole('button', { name: 'New collection' }));
    const dialog = await screen.findByRole('dialog', { name: 'New collection' });
    await user.type(within(dialog).getByLabelText(/Name/), 'reading');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText('You already have a Collection with this name'),
    ).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('shows the Collection dialog with its Bookmarks, each linking to the Bookmark', async () => {
    const { router, user } = renderApp(`/collections/${reading.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Reading' });
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Reading');
    await user.click(within(dialog).getByRole('link', { name: /A post/ }));

    await screen.findByRole('dialog', { name: 'Edit bookmark' });
    expect(router.state.location.pathname).toBe(`/bookmarks/${post.id}`);
  });

  it('says how many Bookmarks are kept when deleting', async () => {
    api.on('DELETE', `/collections/${reading.id}`, () => noContent());
    const { router, user } = renderApp(`/collections/${reading.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Reading' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete “Reading”?' });
    expect(confirm).toHaveTextContent('Its 2 bookmarks will be kept as Uncategorised.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/collections'));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('shows a failed delete in a Snackbar, closing the confirmation', async () => {
    api.on('DELETE', `/collections/${reading.id}`, () => {
      throw new TypeError('Failed to fetch');
    });
    const { user } = renderApp(`/collections/${reading.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Reading' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete “Reading”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server.");
    expect(screen.queryByRole('dialog', { name: 'Delete “Reading”?' })).not.toBeInTheDocument();
  });

  it('renames with PUT', async () => {
    api.on('PUT', `/collections/${reading.id}`, () => Response.json(reading));
    const { router, user } = renderApp(`/collections/${reading.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Reading' });
    const name = within(dialog).getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, 'Later');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/collections'));
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ name: 'Later' });
  });
});
