import { ESLint } from 'eslint';

// Runs the real lint config against in-memory files, so the rule is proven
// without having to commit a file that breaks it.
const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname });

async function restrictedImportErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

const imports = {
  '@prisma/client': `import { Prisma } from '@prisma/client';\nexport type P = Prisma.PrismaClientKnownRequestError;\n`,
  'the generated client': `import { PrismaClient } from '../generated/prisma/client.js';\nexport type P = PrismaClient;\n`,
  PrismaService: `import { PrismaService } from '../prisma/prisma.service.js';\nexport type P = PrismaService;\n`,
};

describe('Prisma import boundary', () => {
  describe.each(Object.entries(imports))('importing %s', (_, code) => {
    it('fails lint in a non-repository file', async () => {
      const errors = await restrictedImportErrors('src/bookmarks/bookmarks.service.ts', code);
      expect(errors).toHaveLength(1);
    });

    it('fails lint in a test file', async () => {
      const errors = await restrictedImportErrors('src/bookmarks/bookmarks.service.spec.ts', code);
      expect(errors).toHaveLength(1);
    });

    it('passes lint in a *.repository.ts file', async () => {
      const errors = await restrictedImportErrors('src/bookmarks/bookmarks.repository.ts', code);
      expect(errors).toHaveLength(0);
    });

    it('passes lint in the seed script', async () => {
      const errors = await restrictedImportErrors('prisma/seed.ts', code);
      expect(errors).toHaveLength(0);
    });
  });

  it('allows unrelated imports', async () => {
    const errors = await restrictedImportErrors(
      'src/bookmarks/bookmarks.service.ts',
      `import { Injectable } from '@nestjs/common';\nexport const I = Injectable;\n`,
    );
    expect(errors).toHaveLength(0);
  });
});
