import { Box, Button } from '@mui/material';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import type { Page } from '../api/types';

/**
 * The list's first page from the route loader, plus the pages that Load more
 * fetched. The cursor never goes in the page URL; the fetcher loads the same
 * route with it. A new first page (new filters, or a reload after a save)
 * starts over.
 */
export function useLoadMore<T extends { id: string }>(
  first: Page<T>,
  path: string,
  search: string,
) {
  const fetcher = useFetcher<{ page: Page<T> }>();
  // `lastFetched` is the fetcher result already added to `more`.
  const [loaded, setLoaded] = useState({
    first,
    lastFetched: fetcher.data,
    more: [] as Page<T>[],
  });

  let updated = loaded;
  if (updated.first !== first) updated = { first, lastFetched: fetcher.data, more: [] };
  if (updated.lastFetched !== fetcher.data) {
    const more = fetcher.data ? [...updated.more, fetcher.data.page] : updated.more;
    updated = { ...updated, lastFetched: fetcher.data, more };
  }
  if (updated !== loaded) setLoaded(updated);

  const pages = [first, ...updated.more];
  const items = uniqueById(pages.flatMap((p) => p.items));
  const cursor = pages[pages.length - 1].nextCursor;

  const loadMore = () => {
    if (!cursor) return;
    const params = new URLSearchParams(search);
    params.set('cursor', cursor);
    return fetcher.load(`${path}?${params}`);
  };

  return { items, hasMore: cursor !== null, loading: fetcher.state !== 'idle', loadMore };
}

export function LoadMoreButton({
  hasMore,
  loading,
  loadMore,
}: Pick<ReturnType<typeof useLoadMore>, 'hasMore' | 'loading' | 'loadMore'>) {
  if (!hasMore) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
      <Button variant="outlined" loading={loading} onClick={loadMore}>
        Load more
      </Button>
    </Box>
  );
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
