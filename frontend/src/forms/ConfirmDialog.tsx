import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useId, useState } from 'react';

/** Asks before an action that can't be undone. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button color="error" variant="contained" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Opens and closes a {@link ConfirmDialog}. It also closes once the action
 * returns a new `result`, so a failed delete's error shows in the dialog below.
 */
export function useConfirmation(result: unknown) {
  const [openedAt, setOpenedAt] = useState<{ result: unknown } | null>(null);
  return {
    open: openedAt !== null && openedAt.result === result,
    show: () => setOpenedAt({ result }),
    hide: () => setOpenedAt(null),
  };
}
