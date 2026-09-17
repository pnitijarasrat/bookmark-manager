import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { AppConfig, loadConfig } from './app-config.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5434/db',
  AUTH0_ISSUER: 'https://dev-yg.us.auth0.com/',
  AUTH0_AUDIENCE: 'https://bbl-candidate-test-api',
  AUTH0_JWKS_URL: 'https://dev-yg.us.auth0.com/.well-known/jwks.json',
};

describe('loadConfig', () => {
  it('returns typed config from a complete environment', () => {
    expect(loadConfig({ ...valid, PORT: '4000' })).toEqual({
      databaseUrl: valid.DATABASE_URL,
      auth0: {
        issuer: valid.AUTH0_ISSUER,
        audience: valid.AUTH0_AUDIENCE,
        jwksUrl: new URL(valid.AUTH0_JWKS_URL),
      },
      port: 4000,
    });
  });

  it('defaults the port to 3001', () => {
    expect(loadConfig(valid).port).toBe(3001);
  });

  it.each(Object.keys(valid))('refuses a missing %s', (key) => {
    const env = { ...valid, [key]: undefined };
    expect(() => loadConfig(env)).toThrow(key);
  });

  it.each(Object.keys(valid))('refuses an empty %s', (key) => {
    expect(() => loadConfig({ ...valid, [key]: '  ' })).toThrow(key);
  });

  it('names every problem at once', () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL[\s\S]*AUTH0_ISSUER[\s\S]*AUTH0_AUDIENCE[\s\S]*AUTH0_JWKS_URL/,
    );
  });

  it.each([
    ['DATABASE_URL', 'not a url'],
    ['DATABASE_URL', 'mysql://u:p@localhost/db'],
    ['AUTH0_ISSUER', 'dev-yg.us.auth0.com'],
    ['AUTH0_ISSUER', 'http://dev-yg.us.auth0.com/'],
    ['AUTH0_ISSUER', 'https://dev-yg.us.auth0.com'],
    ['AUTH0_JWKS_URL', 'http://dev-yg.us.auth0.com/.well-known/jwks.json'],
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
  ])('refuses a malformed %s (%s)', (key, value) => {
    expect(() => loadConfig({ ...valid, [key]: value })).toThrow(key);
  });

  it('never repeats the database URL in the error', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'secret-ish:value' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secret-ish') }),
    );
  });
});

describe('AppModule', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to start when a config value is missing', async () => {
    process.env = { ...saved, ...valid };
    delete process.env.AUTH0_AUDIENCE;
    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'AUTH0_AUDIENCE',
    );
  });

  it('starts and exposes AppConfig when the config is complete', async () => {
    process.env = { ...saved, ...valid };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AppConfig).auth0.audience).toBe(valid.AUTH0_AUDIENCE);
    await moduleRef.close();
  });
});
