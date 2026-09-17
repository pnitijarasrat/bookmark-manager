import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { problem, sendProblem, UnprocessableContentException, type Problem } from './problem.js';

/**
 * Turns every error into problem+json. Messages from exceptions are never
 * sent or logged: a 404 is always the constant body, and anything that isn't
 * an HttpException is a bare 500.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    sendProblem(response, this.toProblem(exception));
  }

  private toProblem(exception: unknown): Problem {
    if (!(exception instanceof HttpException)) {
      // Only the error's class and code: a message can carry database details.
      const { name, code } = describe(exception);
      this.logger.error(`Unexpected ${name}${code ? ` (${code})` : ''}`);
      return problem(HttpStatus.INTERNAL_SERVER_ERROR);
    }
    // Only the status is used, so a 404's message never reaches the body.
    const body = problem(exception.getStatus());
    if (exception instanceof UnprocessableContentException) body.errors = exception.errors;
    return body;
  }
}

function describe(exception: unknown): { name: string; code?: string } {
  if (!(exception instanceof Error)) return { name: typeof exception };
  const code = (exception as { code?: unknown }).code;
  return { name: exception.constructor.name, code: typeof code === 'string' ? code : undefined };
}
