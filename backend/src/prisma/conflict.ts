import { ConflictException } from '@nestjs/common';

// Like not-found.ts, it reads Prisma's error code without importing Prisma.

/**
 * Runs a write and turns a unique-constraint failure (P2002) into a 409.
 * Every unique key on user content is scoped to the Owner, so the 409 says
 * nothing about other Owners. See DECISIONS.md, "Side channels".
 */
export async function orConflict<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2002') throw new ConflictException();
    throw error;
  }
}
