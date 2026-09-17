import { BadRequestException } from '@nestjs/common';

// Keyset cursors: the last item's sort key and id, as base64url JSON. They
// are unsigned, because they only position a query that is already scoped to
// the Owner. See DECISIONS.md, "Lists use cursor pagination with a fixed sort".

export function encodeCursor(key: Record<string, string>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

/**
 * Decodes a cursor and checks it with `parse`, which returns undefined for a
 * wrong shape. Anything that can't be decoded is a 400.
 */
export function decodeCursor<T>(cursor: string, parse: (value: Record<string, unknown>) => T | undefined): T {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException();
  }
  const key = value && typeof value === 'object' && !Array.isArray(value) ? parse(value as Record<string, unknown>) : undefined;
  if (key === undefined) throw new BadRequestException();
  return key;
}

/** The cursor for the page after this one, or null on the last page. */
export function nextCursor<T>(
  { items, hasMore }: { items: T[]; hasMore: boolean },
  keyOf: (last: T) => Record<string, string>,
): string | null {
  const last = items.at(-1);
  return hasMore && last ? encodeCursor(keyOf(last)) : null;
}
