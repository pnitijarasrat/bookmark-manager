import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';

async function bootstrap() {
  // Fails here, before listening, if any config value is missing.
  const app = await NestFactory.create(AppModule);
  await app.listen(app.get(AppConfig).port);
}
await bootstrap();
