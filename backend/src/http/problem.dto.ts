// The problem+json bodies from API_DESIGN.md §5, as OpenAPI schemas.

export class FieldErrorDto {
  /** A JSON Pointer into the request body. */
  pointer: string;
  detail: string;
}

export class ProblemDto {
  type: 'about:blank';
  title: string;
  status: number;
}

export class ValidationProblemDto extends ProblemDto {
  errors: FieldErrorDto[];
}
