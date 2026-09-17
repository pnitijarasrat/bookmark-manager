import { apiFetch, type DataArgs } from './api-fetch';
import { MAX_LIMIT, type Collection } from './types';

/**
 * Copies the named list parameters from the SPA's URL, leaving out empty ones,
 * because the API rejects an unknown or empty value.
 */
export function listQuery<K extends string>(
  search: URLSearchParams,
  names: readonly K[],
): Partial<Record<K, string>> {
  const query: Partial<Record<K, string>> = {};
  for (const name of names) {
    const value = search.get(name);
    if (value?.trim()) query[name] = value;
  }
  return query;
}

/** Every one of the caller's Collections, following the cursor. */
export async function allCollections(args: DataArgs): Promise<Collection[]> {
  const collections: Collection[] = [];
  let cursor: string | undefined;
  do {
    const { data } = await apiFetch(args, (client) =>
      client.GET('/collections', {
        params: { query: { limit: MAX_LIMIT, ...(cursor && { cursor }) } },
      }),
    );
    collections.push(...data!.items);
    cursor = data!.nextCursor ?? undefined;
  } while (cursor);
  return collections;
}
