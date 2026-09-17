import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { AppConfig } from '../config/app-config.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17').start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('queries the configured database through the pg driver adapter', async () => {
    const prisma = new PrismaService({ databaseUrl: container.getConnectionUri() } as AppConfig);
    try {
      const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
      expect(row.db).toBe(container.getDatabase());
    } finally {
      await prisma.onModuleDestroy();
    }
  });
});
