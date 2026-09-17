import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import type { Form } from 'react-router';
import type { ActionResult } from './action-result';

type FormComponent = (props: ComponentProps<typeof Form>) => ReactNode;

/**
 * A dialog around a router form. It goes full-screen on small screens, and
 * shows a form error from the action in a Snackbar.
 */
export function FormDialog({
  title,
  form: FormElement,
  action,
  result,
  onClose,
  fields,
  actions,
  children,
}: {
  title: string;
  /** `Form` for a navigation, or `fetcher.Form`. */
  form: FormComponent;
  action: string;
  result: ActionResult | undefined;
  onClose: () => void;
  fields: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  const formError = result && !result.ok ? result.formError : undefined;
  const [dismissed, setDismissed] = useState<ActionResult | undefined>();

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth aria-labelledby={titleId}>
      <FormElement method="post" action={action} noValidate>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {fields}
          </Stack>
          {children}
        </DialogContent>
        <DialogActions>{actions}</DialogActions>
      </FormElement>
      <Snackbar open={!!formError && dismissed !== result} onClose={() => setDismissed(result)}>
        <Alert severity="error" onClose={() => setDismissed(result)}>
          {formError}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

/** Props that show a field's error from the action next to it. */
export function errorProps(result: ActionResult | undefined, name: string) {
  const message = result && !result.ok ? result.fieldErrors[name] : undefined;
  return { error: !!message, helperText: message };
}
