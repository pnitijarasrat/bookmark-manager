import { Transform } from 'class-transformer';
import { registerDecorator, ValidateIf, type ValidationOptions } from 'class-validator';

// Field rules shared by the request DTOs. See DECISIONS.md, "Field rules".

/** Trims a string before validation, so whitespace alone fails a length check. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Optional, but `null` is still validated (and so refused). Unlike
 * `@IsOptional()`, which skips `null` too.
 */
export const OptionalNotNull = () => ValidateIf((_, value) => value !== undefined);

/** Validated unless it is `null`. Absent still fails, so the field is required. */
export const Nullable = () => ValidateIf((_, value) => value !== null);

/** An absolute http(s) URL with a host, parsed by the WHATWG URL parser. */
export function IsHttpUrl(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isHttpUrl',
      target: target.constructor,
      propertyName,
      options: { message: '$property must be an http or https URL', ...options },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          const url = URL.parse(value);
          return (url?.protocol === 'http:' || url?.protocol === 'https:') && url.hostname !== '';
        },
      },
    });
}
