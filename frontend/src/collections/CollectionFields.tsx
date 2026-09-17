import { TextField } from '@mui/material';
import type { ActionResult } from '../forms/action-result';
import { errorProps } from '../forms/FormDialog';

/** "1 bookmark", "3 bookmarks", or with `more`, "3 more bookmarks". */
export function countLabel(count: number, { more = false } = {}): string {
  return `${count} ${more ? 'more ' : ''}${count === 1 ? 'bookmark' : 'bookmarks'}`;
}

export function NameField({
  defaultValue,
  result,
}: {
  defaultValue?: string;
  result: ActionResult | undefined;
}) {
  return (
    <TextField
      name="name"
      label="Name"
      required
      autoFocus
      defaultValue={defaultValue}
      slotProps={{ htmlInput: { maxLength: 100 } }}
      {...errorProps(result, 'name')}
    />
  );
}
