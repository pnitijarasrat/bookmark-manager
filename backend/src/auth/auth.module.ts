import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { AppConfig } from '../config/app-config.js';
import { TokenGuard } from './token.guard.js';
import { JWKS, TokenRules, TokenVerifier } from './token-verifier.js';

@Module({
  providers: [
    {
      provide: JWKS,
      useFactory: (config: AppConfig) => createRemoteJWKSet(config.auth0.jwksUrl),
      inject: [AppConfig],
    },
    { provide: TokenRules, useFactory: (config: AppConfig) => config.auth0, inject: [AppConfig] },
    TokenVerifier,
    { provide: APP_GUARD, useClass: TokenGuard },
  ],
})
export class AuthModule {}
