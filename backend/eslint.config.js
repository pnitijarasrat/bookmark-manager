import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Only repositories may reach the database. See DECISIONS.md, "The Owner
// scope lives in a repository layer".
const prismaBoundary = {
  paths: [
    {
      name: 'pg',
      message: 'Only *.repository.ts files may reach the database.',
    },
  ],
  patterns: [
    {
      regex: '^@prisma/',
      message: 'Only *.repository.ts files may import Prisma.',
    },
    {
      regex: '(^|/)generated/prisma(/|$)',
      message: 'Only *.repository.ts files may import the Prisma client.',
    },
    {
      regex: '(^|/)prisma\\.service(\\.js)?$',
      message: 'Only *.repository.ts files may import PrismaService.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'src/generated/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // No inline eslint-disable comments, so the boundary can only be relaxed
    // here, in one reviewed place.
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-restricted-imports': ['error', prismaBoundary],
    },
  },
  {
    // Repositories, the Prisma wiring itself, and the seed script are the
    // only files allowed through the boundary.
    files: [
      '**/*.repository.ts',
      'src/prisma/prisma.service.ts',
      'src/prisma/prisma.module.ts',
      // Tests of the Prisma wiring and of the migrated schema itself.
      'src/prisma/prisma.service.spec.ts',
      'test/migrations.spec.ts',
      'prisma/seed.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
);
