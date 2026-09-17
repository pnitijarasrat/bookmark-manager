import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { apiFetch, errorResponse } from '../api/api-fetch';
import { listQuery } from '../api/lists';
import { MAX_LIMIT, type Bookmark, type Collection, type Page } from '../api/types';
import {
  backToList,
  failure,
  fieldError,
  OK,
  submitting,
  text,
  type ActionResult,
} from '../forms/action-result';

const NAME_IN_USE = 'You already have a Collection with this name';

/** The `/collections` list. A `cursor` only comes from the Load more fetcher. */
export async function collectionsLoader(
  args: LoaderFunctionArgs,
): Promise<{ page: Page<Collection> }> {
  const query = listQuery(new URL(args.request.url).searchParams, ['q', 'cursor']);
  const { data } = await apiFetch(args, (client) =>
    client.GET('/collections', { params: { query } }),
  );
  return { page: data! };
}

/** Creates a Collection from the "New Collection" dialog's fetcher. */
export async function collectionsAction(args: ActionFunctionArgs): Promise<ActionResult> {
  const body = { name: text(await args.request.formData(), 'name') };
  return submitting(async () => {
    const { response, error } = await apiFetch(
      args,
      (client) => client.POST('/collections', { body }),
      { allow: 'all' },
    );
    if (response.ok) return OK;
    if (response.status === 409) return fieldError('name', NAME_IN_USE);
    return failure(response, error);
  });
}

export interface CollectionData {
  collection: Collection;
  /** The first page of its Bookmarks, shown read-only in the dialog. */
  bookmarks: Page<Bookmark>;
}

export async function collectionLoader(args: LoaderFunctionArgs): Promise<CollectionData> {
  const path = { path: { id: args.params.id! } };
  const [collection, bookmarks] = await Promise.all([
    apiFetch(args, (client) => client.GET('/collections/{id}', { params: path })),
    apiFetch(args, (client) =>
      client.GET('/collections/{id}/bookmarks', {
        params: { ...path, query: { limit: MAX_LIMIT } },
      }),
    ),
  ]);
  return { collection: collection.data!, bookmarks: bookmarks.data! };
}

/** Renames (PUT) or deletes the Collection in the dialog. */
export async function collectionAction(args: ActionFunctionArgs): Promise<ActionResult | Response> {
  const form = await args.request.formData();
  const path = { params: { path: { id: args.params.id! } } };

  const settle = ({ response, error }: { response: Response; error?: unknown }) => {
    if (response.ok) return backToList(args.request, '/collections');
    if (response.status === 404) throw errorResponse(404);
    if (response.status === 409) return fieldError('name', NAME_IN_USE);
    return failure(response, error);
  };

  switch (text(form, 'intent')) {
    case 'rename': {
      const body = { name: text(form, 'name') };
      return submitting(async () =>
        settle(
          await apiFetch(args, (client) => client.PUT('/collections/{id}', { ...path, body }), {
            allow: 'all',
          }),
        ),
      );
    }
    case 'delete':
      return submitting(async () =>
        settle(
          await apiFetch(args, (client) => client.DELETE('/collections/{id}', path), {
            allow: 'all',
          }),
        ),
      );
    default:
      throw errorResponse(400);
  }
}
