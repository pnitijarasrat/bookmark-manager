import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDto, ValidationProblemDto } from './problem.dto.js';

// How the error responses in API_DESIGN.md §5 appear in the OpenAPI spec.

const DESCRIPTIONS = {
  400: 'Malformed JSON, an unknown field, or an invalid query parameter',
  401: 'The Bearer token is missing, invalid or expired',
  404: "Doesn't exist, belongs to another Owner, or has a malformed ID. Always the same body.",
  409: 'The Owner already has a Collection with this name, ignoring case',
  415: "The body isn't application/json",
  422: 'A value is invalid. Each invalid field is listed with a JSON Pointer.',
} satisfies Record<number, string>;

/** Documents each listed status as an application/problem+json response. */
export function ApiProblems(...statuses: (keyof typeof DESCRIPTIONS)[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDto, ValidationProblemDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        content: {
          'application/problem+json': {
            schema: { $ref: getSchemaPath(status === 422 ? ValidationProblemDto : ProblemDto) },
          },
        },
      }),
    ),
  );
}
