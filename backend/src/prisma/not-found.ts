import { NotFoundException } from '@nestjs/common';

// Shared by the repositories. It reads Prisma's error code without importing
// Prisma, so it needs no exemption from the lint boundary.

// P2025: the Owner-scoped `where` matched no row.
// P2003: a composite foreign key failed, so the Collection isn't the Owner's.
const NOT_FOUND_CODES = new Set(['P2025', 'P2003']);

/**
 * Runs an Owner-scoped query and turns "no such row for this Owner" into the
 * standard 404. Any other error is rethrown untouched, and the global filter
 * answers it with a generic 500.
 */
export async function orNotFound<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && NOT_FOUND_CODES.has(code)) throw new NotFoundException();
    throw error;
  }
}
