import type { DynamicModule, LoggerService, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { JWKS } from '../../src/auth/token-verifier.js';
import { AppConfig, loadConfig } from '../../src/config/app-config.js';
import { TEST_AUDIENCE, TEST_ISSUER, type IdentityProvider } from './identity-provider.js';

export type TestApp = Awaited<ReturnType<typeof startApp>>;

/**
 * Starts the real app on a random local port, with the fake identity provider
 * in place of Auth0. Extra modules and controllers let a test probe the
 * global guard, pipe and filter before any resource routes exist.
 */
export async function startApp({
  idp,
  imports = [],
  controllers = [],
  // Nothing listens here, so a test without a database fails loudly if it
  // ever queries one.
  databaseUrl = 'postgresql://nobody:nothing@127.0.0.1:1/none',
}: {
  idp: IdentityProvider;
  imports?: (Type | DynamicModule)[];
  controllers?: Type[];
  databaseUrl?: string;
}) {
  const config = loadConfig({
    DATABASE_URL: databaseUrl,
    AUTH0_ISSUER: TEST_ISSUER,
    AUTH0_AUDIENCE: TEST_AUDIENCE,
    AUTH0_JWKS_URL: `${TEST_ISSUER}.well-known/jwks.json`,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...imports], controllers })
    .overrideProvider(AppConfig)
    .useValue(config)
    .overrideProvider(JWKS)
    .useValue(idp.keySet)
    .compile();

  const logs: string[] = [];
  const logger: LoggerService = {
    log: (message) => logs.push(String(message)),
    error: (message) => logs.push(String(message)),
    warn: (message) => logs.push(String(message)),
  };

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger,
  });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();

  return {
    app,
    logs,
    request: (path: string, init: RequestInit & { token?: string } = {}) => {
      const { token, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
      return fetch(`${url}${path}`, { ...rest, headers });
    },
    close: () => app.close(),
  };
}
