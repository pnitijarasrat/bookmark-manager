import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { ProblemFilter } from './http/problem.filter.js';
import { createValidationPipe } from './http/validation.pipe.js';

@Module({
  imports: [ConfigModule, AuthModule],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
