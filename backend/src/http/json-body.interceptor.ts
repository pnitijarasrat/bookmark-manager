import {
  Injectable,
  UnsupportedMediaTypeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';

const WRITES = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Refuses a write whose body isn't `application/json` with a 415. Express's
 * JSON parser skips such bodies, so without this they would reach validation
 * as an empty body and come back as 422s. As an interceptor it runs after the
 * token guard, so an unauthenticated caller still gets a 401.
 */
@Injectable()
export class JsonBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (WRITES.has(request.method) && !request.is('application/json')) {
      throw new UnsupportedMediaTypeException();
    }
    return next.handle();
  }
}
