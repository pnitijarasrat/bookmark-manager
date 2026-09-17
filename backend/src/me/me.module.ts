import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { USERINFO_FETCH, UserinfoClient } from './userinfo.client.js';

@Module({
  controllers: [MeController],
  providers: [
    // Read on each call, so a stubbed global `fetch` is still picked up.
    { provide: USERINFO_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
    UserinfoClient,
  ],
})
export class MeModule {}
