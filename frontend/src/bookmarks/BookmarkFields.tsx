import { TextField } from '@mui/material';
import type { Bookmark, Collection } from '../api/types';
import type { ActionResult } from '../forms/action-result';
import { errorProps } from '../forms/FormDialog';

/** The Bookmark form's fields, shared by the New and Edit dialogs. */
export function BookmarkFields({
  bookmark,
  collections,
  result,
}: {
  bookmark?: Bookmark;
  collections: Collection[];
  result: ActionResult | undefined;
}) {
  return (
    <>
      <TextField
        name="url"
        label="URL"
        type="url"
        required
        autoFocus
        defaultValue={bookmark?.url}
        slotProps={{ htmlInput: { maxLength: 2048 } }}
        {...errorProps(result, 'url')}
      />
      <TextField
        name="title"
        label="Title"
        required
        defaultValue={bookmark?.title}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        {...errorProps(result, 'title')}
      />
      <TextField
        name="notes"
        label="Notes"
        multiline
        minRows={2}
        defaultValue={bookmark?.notes}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        {...errorProps(result, 'notes')}
      />
      <CollectionPicker
        name="collectionId"
        label="Collection"
        collections={collections}
        defaultValue={bookmark?.collectionId ?? ''}
        noneLabel="None (Uncategorised)"
        {...errorProps(result, 'collectionId')}
      />
    </>
  );
}

/**
 * A native Select of the User's Collections. "" is the first, "none" option.
 * `extra` options come before the Collections.
 */
export function CollectionPicker({
  collections,
  noneLabel,
  extra,
  ...props
}: {
  name: string;
  label: string;
  collections: Collection[];
  noneLabel: string;
  extra?: { value: string; label: string }[];
  size?: 'small' | 'medium';
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: boolean;
  helperText?: string;
}) {
  const { onChange, ...rest } = props;
  return (
    <TextField
      select
      {...rest}
      onChange={onChange && ((event) => onChange(event.target.value))}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      <option value="">{noneLabel}</option>
      {extra?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {collections.map((collection) => (
        <option key={collection.id} value={collection.id}>
          {collection.name}
        </option>
      ))}
    </TextField>
  );
}
