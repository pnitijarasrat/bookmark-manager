import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { OptionalNotNull, Trim } from '../http/fields.js';

// Request and response bodies for /collections. See API_DESIGN.md §1 and §2.

export class CreateCollectionBody {
  /**
   * Trimmed. Unique per Owner, ignoring case.
   * @example "Reading"
   */
  @Trim()
  @IsString()
  @Length(1, 100)
  name: string;
}

// PUT replaces every writable field, and `name` is the only one.
export class ReplaceCollectionBody extends CreateCollectionBody {}

export class UpdateCollectionBody {
  /** Trimmed. Unique per Owner, ignoring case. Absent means unchanged. */
  @Trim()
  @OptionalNotNull()
  @IsString()
  @Length(1, 100)
  name?: string;
}

export class CollectionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  name: string;
  /** How many of the Owner's Bookmarks are in this Collection. */
  bookmarkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CollectionPageDto {
  items: CollectionDto[];
  /** Pass as `cursor` to get the next page. Null on the last page. */
  nextCursor: string | null;
}
