import { readFile, writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

// Writes the committed OpenAPI spec, or with --check, fails if it's out of
// date. Run from the build (`npm run openapi`), because the @nestjs/swagger
// CLI plugin adds the schemas at compile time. See DECISIONS.md, "API types
// are generated from OpenAPI".

const SPEC = new URL('../openapi.json', import.meta.url);

// The app is only inspected, never started, but its config must still load.
// These placeholders keep the spec independent of any .env file.
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://openapi@localhost/openapi',
  AUTH0_ISSUER: 'https://issuer.invalid/',
  AUTH0_AUDIENCE: 'https://audience.invalid',
  AUTH0_JWKS_URL: 'https://issuer.invalid/.well-known/jwks.json',
});

async function generate(): Promise<string> {
  // `preview` builds the module graph without creating providers, so nothing
  // connects to a database.
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const config = new DocumentBuilder()
    .setTitle('Bookmark manager API')
    .setDescription('The contract is described in API_DESIGN.md. Every route needs a Bearer token.')
    .setVersion('1')
    .addServer('http://localhost:3001')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  await app.close();
  return `${JSON.stringify(document, null, 2)}\n`;
}

const spec = await generate();
if (process.argv.includes('--check')) {
  const committed = await readFile(SPEC, 'utf8').catch(() => '');
  if (committed !== spec) {
    console.error('backend/openapi.json is out of date. Run `npm run openapi` and commit the result.');
    process.exit(1);
  }
  console.log('backend/openapi.json is up to date.');
} else {
  await writeFile(SPEC, spec);
  console.log('Wrote backend/openapi.json.');
}
