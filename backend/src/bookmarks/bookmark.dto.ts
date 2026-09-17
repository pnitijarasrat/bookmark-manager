import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { IsHttpUrl, Nullable, OptionalNotNull, Trim } from '../http/fields.js';
import { ListQuery } from '../http/list.dto.js';

// Request and response bodies for /bookmarks. See API_DESIGN.md §1 and §2.

export class CreateBookmarkBody {
  /**
   * Trimmed, then stored as entered. http(s) only, with a host.
   * @example "https://example.com/post"
   */
  @Trim()
  @IsHttpUrl()
  @MaxLength(2048)
  url: string;

  /** Trimmed. */
  @Trim()
  @IsString()
  @Length(1, 200)
  title: string;

  /** Stored exactly as sent. Defaults to "". */
  @OptionalNotNull()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** The Owner's Collection, or null (the default) for Uncategorised. */
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;
}

// A full replace: every writable field is required, collectionId included.
export class ReplaceBookmarkBody {
  /** Trimmed, then stored as entered. http(s) only, with a host. */
  @Trim()
  @IsHttpUrl()
  @MaxLength(2048)
  url: string;

  /** Trimmed. */
  @Trim()
  @IsString()
  @Length(1, 200)
  title: string;

  /** Stored exactly as sent. */
  @IsString()
  @MaxLength(2000)
  notes: string;

  /** The Owner's Collection, or null for Uncategorised. Must be sent. */
  @Nullable()
  @IsUUID()
  collectionId: string | null;
}

// Absent means unchanged. Only collectionId may be null.
export class UpdateBookmarkBody {
  /** Trimmed, then stored as entered. http(s) only, with a host. */
  @Trim()
  @OptionalNotNull()
  @IsHttpUrl()
  @MaxLength(2048)
  url?: string;

  /** Trimmed. */
  @Trim()
  @OptionalNotNull()
  @IsString()
  @Length(1, 200)
  title?: string;

  /** Stored exactly as sent. */
  @OptionalNotNull()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** The Owner's Collection, or null to make the Bookmark Uncategorised. */
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;
}

export class BookmarkListQuery extends ListQuery {
  /**
   * A Collection's id for the Bookmarks in it, or `none` for Uncategorised
   * Bookmarks only. Any other value, or a Collection that isn't the caller's,
   * is a 404.
   */
  @IsOptional()
  @IsString()
  collectionId?: string;
}

export class BookmarkDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  url: string;
  title: string;
  /** Always a string, "" when empty. */
  notes: string;
  /** Null for an Uncategorised Bookmark. */
  @ApiProperty({ format: 'uuid', nullable: true })
  collectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class BookmarkPageDto {
  items: BookmarkDto[];
  /** Pass as `cursor` to get the next page. Null on the last page. */
  nextCursor: string | null;
}
