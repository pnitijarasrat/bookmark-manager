import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { send } from './http/problem.filter.js';
import { problem } from './http/problem.js';
import { requestLogger } from './http/request-logger.js';

// The SPA's origin, fixed by the Auth0 tenant.
const SPA_ORIGIN = 'http://localhost:3000';

/**
 * The app-level middleware, shared by main.ts and the tests. The app must be
 * created with `bodyParser: false`, so JSON parsing happens here and a
 * malformed body gets a problem+json 400.
 */
export function configureApp(app: NestExpressApplication) {
  app.use(requestLogger);
  app.use(helmet());
  app.enableCors({
    // A list, so any other origin gets no Allow-Origin header at all.
    origin: [SPA_ORIGIN],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  app.use(express.json());
  app.use(bodyParseErrorHandler);
}

// Runs before any route, so it only sees errors from the middleware above.
function bodyParseErrorHandler(
  error: { status?: unknown },
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  if (response.headersSent) {
    next(error);
    return;
  }
  const status =
    typeof error.status === 'number' && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  send(response, status, JSON.stringify(problem(status)));
}
