import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadConfig } from '../config/app-config.js';
// The one test of the Prisma wiring itself; everything else goes through repositories.
// eslint-disable-next-line no-restricted-imports
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
    const config = loadConfig({
      DATABASE_URL: container.getConnectionUri(),
      AUTH0_ISSUER: 'https://issuer.test/',
      AUTH0_AUDIENCE: 'audience',
      AUTH0_JWKS_URL: 'https://issuer.test/jwks.json',
    });
    const prisma = new PrismaService(config);
    try {
      const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
      expect(row.db).toBe(container.getDatabase());
    } finally {
      await prisma.onModuleDestroy();
    }
  });
});
