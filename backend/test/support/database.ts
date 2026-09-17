import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * A throwaway Postgres 17 with the real migrations applied. Tests never clean
 * it up. Each test uses fresh Owners from `newOwner()` instead, so nothing but
 * the repositories touches the database.
 */
export async function startDatabase() {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17').start();
  const url = container.getConnectionUri();
  await promisify(execFile)('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url },
  });
  return { url, stop: () => container.stop() };
}

export const newOwner = () => `auth0|${randomUUID()}`;

// A well-formed UUIDv4 that no row has.
export const missingId = () => randomUUID();
