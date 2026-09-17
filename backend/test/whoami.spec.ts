import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UnsecuredJWT } from 'jose';
import { createIdentityProvider } from './support/identity-provider.js';

// `npm run whoami -- <token>`: decodes a token locally and prints only its
// `sub`. See DECISIONS.md, "Seed data".

const script = new URL('../scripts/whoami.ts', import.meta.url).pathname;

async function whoami(...args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)('node', [script, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, stdout, stderr };
  }
}

describe('whoami', () => {
  it('prints only the sub of a signed token', async () => {
    const idp = await createIdentityProvider();
    const sub = 'auth0|0123456789abcdef01234567';
    const token = await idp.tokenFor(sub, { email: 'someone@example.test' });

    expect(await whoami(token)).toEqual({ code: 0, stdout: `${sub}\n`, stderr: '' });
  });

  it('does not verify the token', async () => {
    const expired = new UnsecuredJWT({ sub: 'auth0|expired', exp: 1 }).encode();
    expect((await whoami(expired)).stdout).toBe('auth0|expired\n');
  });

  it.each([
    ['no argument', []],
    ['an empty argument', ['']],
    ['plain text', ['not-a-token']],
    ['three parts that are not base64 JSON', ['aaa.bbb.ccc']],
    ['a token without a sub', [new UnsecuredJWT({ email: 'x@example.test' }).encode()]],
    ['a token with an empty sub', [new UnsecuredJWT({ sub: '' }).encode()]],
  ])('rejects %s, and echoes nothing', async (_, args) => {
    const { code, stdout, stderr } = await whoami(...args);
    expect(code).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/usage|not a JWT|no sub/i);
    for (const arg of args.filter(Boolean)) expect(stderr).not.toContain(arg);
  });
});
