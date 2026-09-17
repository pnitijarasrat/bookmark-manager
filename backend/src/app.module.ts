import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BookmarksModule } from './bookmarks/bookmarks.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { ConfigModule } from './config/config.module.js';
import { JsonBodyInterceptor } from './http/json-body.interceptor.js';
import { ProblemFilter } from './http/problem.filter.js';
import { createValidationPipe } from './http/validation.pipe.js';
import { MeModule } from './me/me.module.js';

@Module({
  imports: [ConfigModule, AuthModule, MeModule, CollectionsModule, BookmarksModule],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: JsonBodyInterceptor },
  ],
})
export class AppModule {}
