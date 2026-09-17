import { redirect } from 'react-router';
import type { ValidationProblem } from '../api/types';

export type FieldErrors = Partial<Record<string, string>>;

/**
 * What a form action returns when it doesn't redirect. Field errors show next
 * to their fields, and a form error shows in a Snackbar. See DECISIONS.md,
 * "How errors are shown".
 */
export type ActionResult =
  { ok: true } | { ok: false; fieldErrors: FieldErrors; formError?: string };

export const OK: ActionResult = { ok: true };

export function fieldError(field: string, message: string): ActionResult {
  return { ok: false, fieldErrors: { [field]: message } };
}

/** Turns a failed API response into field errors (422) or a form error. */
export function failure(response: Response, error: unknown): ActionResult {
  if (response.status === 422 && isValidationProblem(error)) {
    const fieldErrors: FieldErrors = {};
    for (const { pointer, detail } of error.errors) {
      fieldErrors[pointer.replace(/^\//, '')] ??= capitalise(detail);
    }
    return { ok: false, fieldErrors };
  }
  return {
    ok: false,
    fieldErrors: {},
    formError:
      response.status >= 500
        ? 'Something went wrong on the server. Try again.'
        : `The change couldn't be saved (error ${response.status}).`,
  };
}

/**
 * Runs an action's API calls, and turns a network failure into a form error.
 * Thrown Responses (redirects and 404s) still reach the router.
 */
export async function submitting<T>(run: () => Promise<T>): Promise<T | ActionResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false,
      fieldErrors: {},
      formError: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}

/** Back to `list` after a save or delete, keeping the filters in the request URL. */
export function backToList(request: Request, list: string): Response {
  return redirect(`${list}${new URL(request.url).search}`);
}

/** Reads a text field from a submitted form, or "" if it's missing. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function isValidationProblem(error: unknown): error is ValidationProblem {
  return Array.isArray((error as ValidationProblem | undefined)?.errors);
}

function capitalise(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}
