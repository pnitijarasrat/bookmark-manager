import { Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
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
import type { Collection, Page } from '../api/types';
import type { ActionResult } from '../forms/action-result';
import { FormDialog } from '../forms/FormDialog';
import { ListHeader } from '../lists/ListHeader';
import { LoadMoreButton, useLoadMore } from '../lists/load-more';
import { SearchField, withParams } from '../lists/SearchField';
import { countLabel, NameField } from './CollectionFields';

export function CollectionsPage() {
  const { page } = useLoaderData() as { page: Page<Collection> };
  const { search } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const list = useLoadMore(page, '/collections', search);
  const [creating, setCreating] = useState(false);
  const closeNew = useCallback(() => setCreating(false), []);

  return (
    <>
      <ListHeader title="Collections" newLabel="New collection" onNew={() => setCreating(true)} />
      <Box sx={{ mb: 2 }}>
        <SearchField
          value={params.get('q') ?? ''}
          onSearch={(q) => navigate(withParams('/collections', new URLSearchParams({ q })))}
        />
      </Box>
      {list.items.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No collections here yet.
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {list.items.map((collection) => (
              <ListItemButton
                key={collection.id}
                component={Link}
                to={`/collections/${collection.id}${search}`}
                divider
              >
                <ListItemText
                  primary={collection.name}
                  secondary={countLabel(collection.bookmarkCount)}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
      <LoadMoreButton {...list} />
      {creating && <NewCollectionDialog onClose={closeNew} />}
      <Outlet />
    </>
  );
}

function NewCollectionDialog({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<ActionResult>();
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true;
  useEffect(() => {
    if (saved) onClose();
  }, [saved, onClose]);

  return (
    <FormDialog
      title="New collection"
      form={fetcher.Form}
      action="/collections"
      result={fetcher.data}
      onClose={onClose}
      fields={<NameField result={fetcher.data} />}
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
