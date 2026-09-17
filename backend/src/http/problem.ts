import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

// application/problem+json bodies (RFC 9457). See API_DESIGN.md §5.

export type FieldError = { pointer: string; detail: string };

export type Problem = {
  type: 'about:blank';
  title: string;
  status: number;
  errors?: FieldError[];
};

// Titles from RFC 9110 where Node still uses the older names.
const TITLES: Record<number, string> = {
  413: 'Content Too Large',
  422: 'Unprocessable Content',
};

export function problem(status: number): Problem {
  return { type: 'about:blank', title: TITLES[status] ?? STATUS_CODES[status] ?? 'Error', status };
}

// Every 404 is exactly this, byte for byte. It never repeats a path or an ID.
export const NOT_FOUND_BODY = JSON.stringify(problem(HttpStatus.NOT_FOUND));

/** A 422 that lists each invalid field as a JSON Pointer into the request body. */
export class UnprocessableContentException extends HttpException {
  constructor(readonly errors: FieldError[]) {
    super('Unprocessable Content', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
