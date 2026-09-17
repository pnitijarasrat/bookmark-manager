/**
 * Escapes `\`, `%` and `_`, so a search matches them literally inside
 * Prisma's `contains` (a LIKE with `\` as the escape character).
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
