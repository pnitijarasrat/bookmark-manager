import {
  Button,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import type { Bookmark, Collection } from '../api/types';
import type { ActionResult } from '../forms/action-result';
import { FormDialog } from '../forms/FormDialog';
import { ListHeader } from '../lists/ListHeader';
import { LoadMoreButton, useLoadMore } from '../lists/load-more';
import { SearchField, withParams } from '../lists/SearchField';
import { BookmarkFields, CollectionPicker } from './BookmarkFields';
import type { BookmarksData } from './bookmarks.data';

export function BookmarksPage() {
  const { page, collections: loaded } = useLoaderData() as BookmarksData;
  const collections = loaded ?? [];
  const { search } = useLocation();
  const list = useLoadMore(page, '/bookmarks', search);
  const [creating, setCreating] = useState(false);
  const closeNew = useCallback(() => setCreating(false), []);
  const names = new Map(collections.map((c) => [c.id, c.name]));

  return (
    <>
      <ListHeader title="Bookmarks" newLabel="New bookmark" onNew={() => setCreating(true)} />
      <BookmarkFilters collections={collections} />
      {list.items.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No bookmarks here yet.
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {list.items.map((bookmark) => (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                collectionName={
                  bookmark.collectionId ? names.get(bookmark.collectionId) : undefined
                }
                search={search}
              />
            ))}
          </List>
        </Paper>
      )}
      <LoadMoreButton {...list} />
      {creating && <NewBookmarkDialog collections={collections} onClose={closeNew} />}
      <Outlet context={collections} />
    </>
  );
}

function BookmarkRow({
  bookmark,
  collectionName,
  search,
}: {
  bookmark: Bookmark;
  collectionName: string | undefined;
  search: string;
}) {
  return (
    <ListItemButton component={Link} to={`/bookmarks/${bookmark.id}${search}`} divider>
      <ListItemText
        primary={bookmark.title}
        secondary={bookmark.url}
        slotProps={{ secondary: { noWrap: true } }}
        sx={{ minWidth: 0 }}
      />
      {collectionName && <Chip label={collectionName} size="small" sx={{ ml: 1 }} />}
    </ListItemButton>
  );
}

/** Search and Collection filters, kept in the URL. */
function BookmarkFilters({ collections }: { collections: Collection[] }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(name, value);
    navigate(withParams('/bookmarks', next));
  };

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <SearchField value={params.get('q') ?? ''} onSearch={(q) => set('q', q)} />
      <CollectionPicker
        name="collectionId"
        label="Collection"
        size="small"
        collections={collections}
        noneLabel="All"
        extra={[{ value: 'none', label: 'Uncategorised' }]}
        value={params.get('collectionId') ?? ''}
        onChange={(value) => set('collectionId', value)}
      />
    </Stack>
  );
}

function NewBookmarkDialog({
  collections,
  onClose,
}: {
  collections: Collection[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true;
  useEffect(() => {
    if (saved) onClose();
  }, [saved, onClose]);

  return (
    <FormDialog
      title="New bookmark"
      form={fetcher.Form}
      action="/bookmarks"
      result={fetcher.data}
      onClose={onClose}
      fields={<BookmarkFields collections={collections} result={fetcher.data} />}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" loading={fetcher.state !== 'idle'}>
            Save
          </Button>
        </>
      }
    />
  );
}
