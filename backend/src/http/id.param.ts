import { Injectable, NotFoundException, Param, type PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * A path ID that isn't a UUID can't name anything, so it gets the constant
 * 404 before any query runs (and before Postgres could fail on the cast). See
 * DECISIONS.md, "Another Owner's ID is always a 404".
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) throw new NotFoundException();
    return value;
  }
}

/** The `:id` path parameter, checked by ParseIdPipe. */
export const IdParam = () => Param('id', ParseIdPipe);
