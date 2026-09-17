import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { apiFetch, errorResponse } from '../api/api-fetch';
import { allCollections, listQuery } from '../api/lists';
import type { Bookmark, Collection, Page } from '../api/types';
import {
  backToList,
  failure,
  fieldError,
  OK,
  submitting,
  text,
  type ActionResult,
  type Rejected,
} from '../forms/action-result';

export const BOOKMARK_FILTERS = ['q', 'collectionId'] as const;
const COLLECTION_NOT_FOUND = 'Collection not found';

export interface BookmarksData {
  page: Page<Bookmark>;
  /** Every Collection, for the picker and the filter. Null for Load more. */
  collections: Collection[] | null;
}

/**
 * The `/bookmarks` list. The filters come from the URL. A `cursor` in the URL
 * only comes from the Load more fetcher, which needs just the next page.
 */
export async function bookmarksLoader(args: LoaderFunctionArgs): Promise<BookmarksData> {
  const query = listQuery(new URL(args.request.url).searchParams, [...BOOKMARK_FILTERS, 'cursor']);
  const [page, collections] = await Promise.all([
    apiFetch(args, (client) => client.GET('/bookmarks', { params: { query } })),
    query.cursor ? null : allCollections(args),
  ]);
  return { page: page.data!, collections };
}

/** Creates a Bookmark from the "New Bookmark" dialog's fetcher. */
export async function bookmarksAction(args: ActionFunctionArgs): Promise<ActionResult | Rejected> {
  const body = bookmarkBody(await args.request.formData());
  return submitting(async () => {
    const { response, error } = await apiFetch(
      args,
      (client) => client.POST('/bookmarks', { body }),
      { allow: 'all' },
    );
    if (response.ok) return OK;
    if (response.status === 404) {
      // The only ID a create can name is the Collection's.
      if (body.collectionId === null) throw errorResponse(404);
      return fieldError('collectionId', COLLECTION_NOT_FOUND, 404);
    }
    return failure(response, error);
  });
}

export async function bookmarkLoader(args: LoaderFunctionArgs): Promise<{ bookmark: Bookmark }> {
  const id = args.params.id!;
  const { data } = await apiFetch(args, (client) =>
    client.GET('/bookmarks/{id}', { params: { path: { id } } }),
  );
  return { bookmark: data! };
}

/** Saves (PUT) or deletes the Bookmark in the dialog. */
export async function bookmarkAction(args: ActionFunctionArgs): Promise<Rejected | Response> {
  const id = args.params.id!;
  const form = await args.request.formData();
  const path = { params: { path: { id } } };

  switch (text(form, 'intent')) {
    case 'update': {
      const body = bookmarkBody(form);
      return submitting(async () => {
        const { response, error } = await apiFetch(
          args,
          (client) => client.PUT('/bookmarks/{id}', { ...path, body }),
          { allow: 'all' },
        );
        if (response.ok) return backToList(args.request, '/bookmarks');
        if (response.status === 404) {
          // A 404 names either the Bookmark or the Collection. Only a
          // Collection is shown on the picker; a missing Bookmark still
          // goes to the error boundary.
          if (body.collectionId === null) throw errorResponse(404);
          await apiFetch(args, (client) => client.GET('/bookmarks/{id}', path));
          return fieldError('collectionId', COLLECTION_NOT_FOUND, 404);
        }
        return failure(response, error);
      });
    }
    case 'delete':
      return submitting(async () => {
        const { response, error } = await apiFetch(
          args,
          (client) => client.DELETE('/bookmarks/{id}', path),
          { allow: 'all' },
        );
        if (response.ok) return backToList(args.request, '/bookmarks');
        if (response.status === 404) throw errorResponse(404);
        return failure(response, error);
      });
    default:
      throw errorResponse(400);
  }
}

function bookmarkBody(form: FormData) {
  return {
    url: text(form, 'url'),
    title: text(form, 'title'),
    notes: text(form, 'notes'),
    collectionId: text(form, 'collectionId') || null,
  };
}
