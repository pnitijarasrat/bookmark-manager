import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

// Shared by the repositories. The `.repository.ts` suffix is what lets it
// import Prisma (see eslint.config.js).

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && NOT_FOUND_CODES.has(error.code)) {
      throw new NotFoundException();
    }
    throw error;
  }
}
