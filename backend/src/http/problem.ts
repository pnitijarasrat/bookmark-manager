import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
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

/**
 * Writes a problem+json response. A 404 is always exactly `problem(404)`, byte
 * for byte, and never repeats a path or an ID.
 */
export function sendProblem(response: Response, body: Problem) {
  response.status(body.status).type('application/problem+json').send(JSON.stringify(body));
}

/** A 422 that lists each invalid field as a JSON Pointer into the request body. */
export class UnprocessableContentException extends HttpException {
  constructor(readonly errors: FieldError[]) {
    super('Unprocessable Content', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
