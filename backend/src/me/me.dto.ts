import { ApiProperty } from '@nestjs/swagger';

// The response of GET /me. See API_DESIGN.md §1.

export class MeDto {
  /** Null if Auth0 doesn't return one. */
  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  /** Null if Auth0 doesn't return one. */
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  /** An image URL, or null if Auth0 doesn't return one. */
  @ApiProperty({ type: String, nullable: true })
  picture: string | null;
}
