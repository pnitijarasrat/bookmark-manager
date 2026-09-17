import { Box, Button, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useState } from 'react';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useSubmit,
} from 'react-router';
import type { ActionResult } from '../forms/action-result';
import { ConfirmDialog } from '../forms/ConfirmDialog';
import { FormDialog } from '../forms/FormDialog';
import type { CollectionData } from './collections.data';
import { countLabel, NameField } from './CollectionFields';

/**
 * `/collections/:id`: rename, a read-only list of the Collection's Bookmarks,
 * and Delete. See DECISIONS.md, "What the dialogs contain".
 */
export function CollectionDialog() {
  const { collection, bookmarks } = useLoaderData() as CollectionData;
  const result = useActionData() as ActionResult | undefined;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const { search } = useLocation();
  const [confirming, setConfirming] = useState(false);

  const action = `/collections/${collection.id}${search}`;
  const pendingIntent =
    navigation.state === 'submitting' ? navigation.formData?.get('intent') : undefined;
  const close = () => navigate(`/collections${search}`);
  const hidden = collection.bookmarkCount - bookmarks.items.length;

  return (
    <FormDialog
      title={collection.name}
      form={Form}
      action={action}
      result={result}
      onClose={close}
      fields={
        <>
          <input type="hidden" name="intent" value="rename" />
          <NameField key={collection.id} defaultValue={collection.name} result={result} />
        </>
      }
      actions={
        <>
          <Button color="error" onClick={() => setConfirming(true)}>
            Delete
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={close}>Close</Button>
          <Button type="submit" variant="contained" loading={pendingIntent === 'rename'}>
            Save
          </Button>
        </>
      }
    >
      <Typography variant="subtitle2" component="h2" sx={{ mt: 3 }}>
        {countLabel(collection.bookmarkCount)}
      </Typography>
      <List dense>
        {bookmarks.items.map((bookmark) => (
          <ListItemButton key={bookmark.id} component={Link} to={`/bookmarks/${bookmark.id}`}>
            <ListItemText
              primary={bookmark.title}
              secondary={bookmark.url}
              slotProps={{ secondary: { noWrap: true } }}
            />
          </ListItemButton>
        ))}
      </List>
      {hidden > 0 && (
        <Typography variant="body2" color="text.secondary">
          and {countLabel(hidden, { more: true })}
        </Typography>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Delete “${collection.name}”?`}
        message={deleteMessage(collection.bookmarkCount)}
        confirmLabel="Delete"
        pending={pendingIntent === 'delete'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => submit({ intent: 'delete' }, { method: 'post', action })}
      />
    </FormDialog>
  );
}

function deleteMessage(count: number): string {
  if (count === 0) return "It has no bookmarks. This can't be undone.";
  const kept = count === 1 ? 'Its 1 bookmark will be kept' : `Its ${count} bookmarks will be kept`;
  return `${kept} as Uncategorised.`;
}
