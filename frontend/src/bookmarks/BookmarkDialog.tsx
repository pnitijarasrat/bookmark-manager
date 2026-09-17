import { Box, Button } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useState } from 'react';
import {
  Form,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useOutletContext,
  useSubmit,
} from 'react-router';
import type { Bookmark, Collection } from '../api/types';
import type { ActionResult } from '../forms/action-result';
import { ConfirmDialog } from '../forms/ConfirmDialog';
import { FormDialog } from '../forms/FormDialog';
import { BookmarkFields } from './BookmarkFields';

/** `/bookmarks/:id`: the edit form, over the list. */
export function BookmarkDialog() {
  const { bookmark } = useLoaderData() as { bookmark: Bookmark };
  const collections = useOutletContext<Collection[]>();
  const result = useActionData() as ActionResult | undefined;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const { search } = useLocation();
  const [confirming, setConfirming] = useState(false);

  const action = `/bookmarks/${bookmark.id}${search}`;
  const pendingIntent =
    navigation.state === 'submitting' ? navigation.formData?.get('intent') : undefined;
  const close = () => navigate(`/bookmarks${search}`);

  return (
    <FormDialog
      title="Edit bookmark"
      form={Form}
      action={action}
      result={result}
      onClose={close}
      fields={
        <>
          <input type="hidden" name="intent" value="update" />
          <BookmarkFields
            key={bookmark.id}
            bookmark={bookmark}
            collections={collections}
            result={result}
          />
        </>
      }
      actions={
        <>
          <Button
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewIcon />}
          >
            Open link
          </Button>
          <Button color="error" onClick={() => setConfirming(true)}>
            Delete
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={close}>Close</Button>
          <Button type="submit" variant="contained" loading={pendingIntent === 'update'}>
            Save
          </Button>
        </>
      }
    >
      <ConfirmDialog
        open={confirming}
        title="Delete this bookmark?"
        message={`“${bookmark.title}” will be deleted. This can't be undone.`}
        confirmLabel="Delete"
        pending={pendingIntent === 'delete'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => submit({ intent: 'delete' }, { method: 'post', action })}
      />
    </FormDialog>
  );
}
