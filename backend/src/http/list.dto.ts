import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query parameters shared by every list. Any failure here is a 400 (see
// validation.pipe.ts). See API_DESIGN.md §4.

export const DEFAULT_LIMIT = 50;

export class ListQuery {
  /** Items per page, from 1 to 100. */
  @ApiPropertyOptional({ type: 'integer', default: DEFAULT_LIMIT })
  @IsOptional()
  // Plain digits only, so "1e1", "0x10" and " 5" are refused.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** The `nextCursor` from the previous page. Opaque. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** A case-insensitive substring match, trimmed. `%`, `_` and `\` match literally. */
  // Trimmed, and an empty search counts as absent.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
