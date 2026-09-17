import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * Logs each request's method, route pattern, status and duration. Never the
 * real path or query string, which hold IDs and search text, and never a
 * body, a token or the Owner. See DECISIONS.md, "Headers, rate limiting and
 * logging".
 */
export function requestLogger(request: Request, response: Response, next: NextFunction) {
  const started = performance.now();
  response.on('finish', () => {
    // Express sets `route` only when a route matched.
    const route = (request.route as { path?: unknown } | undefined)?.path;
    const pattern = typeof route === 'string' ? route : '(unmatched)';
    const ms = Math.round(performance.now() - started);
    logger.log(`${request.method} ${pattern} ${response.statusCode} ${ms}ms`);
  });
  next();
}
