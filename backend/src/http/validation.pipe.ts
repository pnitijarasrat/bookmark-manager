import {
  BadRequestException,
  ValidationPipe,
  type ArgumentMetadata,
  type ValidationError,
} from '@nestjs/common';
import { UnprocessableContentException, type FieldError } from './problem.js';

/**
 * The global pipe. In a body, an unknown field (including `ownerId`) is a 400,
 * and any other failure is a 422 with a pointer per field. In a query string,
 * every failure is a 400: the query is built by the client's code, not typed
 * by the User. See DECISIONS.md, "Errors are problem+json, with 400 for
 * malformed requests and 422 for invalid values".
 */
class ProblemValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (metadata.type === 'query') throw new BadRequestException();
      throw error;
    }
  }
}

export function createValidationPipe() {
  return new ProblemValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      errors.some(hasUnknownField)
        ? new BadRequestException()
        : new UnprocessableContentException(errors.flatMap((error) => fieldErrors(error, ''))),
  });
}

function hasUnknownField(error: ValidationError): boolean {
  return (
    'whitelistValidation' in (error.constraints ?? {}) ||
    (error.children ?? []).some(hasUnknownField)
  );
}

function fieldErrors(error: ValidationError, parent: string): FieldError[] {
  const pointer = `${parent}/${escapePointer(error.property)}`;
  const [detail] = Object.values(error.constraints ?? {});
  return [
    ...(detail ? [{ pointer, detail }] : []),
    ...(error.children ?? []).flatMap((child) => fieldErrors(child, pointer)),
  ];
}

// RFC 6901: "~" becomes "~0" and "/" becomes "~1".
function escapePointer(segment: string) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}
