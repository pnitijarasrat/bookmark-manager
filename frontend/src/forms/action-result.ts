import { data, redirect } from 'react-router';
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

/**
 * A failed result, sent with an error status. The router doesn't reload the
 * page's data after one, so the list behind the dialog keeps its Load more
 * pages. The component still reads the result with `useActionData`.
 */
export type Rejected = ReturnType<typeof data<ActionResult>>;

/** A failed action gets no API response, e.g. offline, so it has no status of its own. */
const NO_RESPONSE = 503;

function rejected(result: ActionResult, status: number): Rejected {
  return data(result, { status });
}

export function fieldError(field: string, message: string, status: number): Rejected {
  return rejected({ ok: false, fieldErrors: { [field]: message } }, status);
}

/** Turns a failed API response into field errors (422) or a form error. */
export function failure(response: Response, error: unknown): Rejected {
  if (response.status === 422 && isValidationProblem(error)) {
    const fieldErrors: FieldErrors = {};
    for (const { pointer, detail } of error.errors) {
      fieldErrors[pointer.replace(/^\//, '')] ??= capitalise(detail);
    }
    return rejected({ ok: false, fieldErrors }, response.status);
  }
  return rejected(
    {
      ok: false,
      fieldErrors: {},
      formError:
        response.status >= 500
          ? 'Something went wrong on the server. Try again.'
          : `The change couldn't be saved (error ${response.status}).`,
    },
    response.status,
  );
}

/**
 * Runs an action's API calls, and turns a network failure into a form error.
 * Thrown Responses (redirects and 404s) still reach the router.
 */
export async function submitting<T>(run: () => Promise<T>): Promise<T | Rejected> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Response) throw error;
    return rejected(
      {
        ok: false,
        fieldErrors: {},
        formError: "Couldn't reach the server. Check your connection and try again.",
      },
      NO_RESPONSE,
    );
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
