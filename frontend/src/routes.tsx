import { redirect, type RouteObject } from 'react-router';
import { errorResponse } from './api/api-fetch';
import { requireAuth } from './auth/require-auth';
import { DEFAULT_ROUTE } from './auth/return-to';
import { BookmarkDialog } from './bookmarks/BookmarkDialog';
import {
  bookmarkAction,
  bookmarkLoader,
  bookmarksAction,
  bookmarksLoader,
} from './bookmarks/bookmarks.data';
import { BookmarksPage } from './bookmarks/BookmarksPage';
import { CollectionDialog } from './collections/CollectionDialog';
import {
  collectionAction,
  collectionLoader,
  collectionsAction,
  collectionsLoader,
} from './collections/collections.data';
import { CollectionsPage } from './collections/CollectionsPage';
import { AppShell } from './layout/AppShell';
import { FullPageSpinner } from './layout/FullPageSpinner';
import { RouteError } from './layout/RouteError';
import { shellLoader, shellShouldRevalidate } from './layout/shell.data';
import { callbackLoader, LoginPage, loginLoader } from './login/login';

/**
 * The public routes are `/login` and `/callback`. Everything else sits under
 * the pathless layout route, whose middleware is the guard. See DECISIONS.md,
 * "Routes" and "The route guard is layout-route middleware".
 */
export const routes: RouteObject[] = [
  { path: '/login', loader: loginLoader, Component: LoginPage },
  { path: '/callback', loader: callbackLoader, Component: FullPageSpinner },
  {
    middleware: [requireAuth],
    loader: shellLoader,
    shouldRevalidate: shellShouldRevalidate,
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      {
        // Errors below show inside the shell.
        ErrorBoundary: RouteError,
        children: [
          { index: true, loader: () => redirect(DEFAULT_ROUTE) },
          {
            path: 'bookmarks',
            loader: bookmarksLoader,
            action: bookmarksAction,
            Component: BookmarksPage,
            children: [
              {
                path: ':id',
                loader: bookmarkLoader,
                action: bookmarkAction,
                Component: BookmarkDialog,
              },
            ],
          },
          {
            path: 'collections',
            loader: collectionsLoader,
            action: collectionsAction,
            Component: CollectionsPage,
            children: [
              {
                path: ':id',
                loader: collectionLoader,
                action: collectionAction,
                Component: CollectionDialog,
              },
            ],
          },
          {
            path: '*',
            loader: () => {
              throw errorResponse(404);
            },
          },
        ],
      },
    ],
  },
];
