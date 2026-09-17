import { startApp, type TestApp } from './app.js';
import { newOwner, startDatabase } from './database.js';
import { createIdentityProvider, type IdentityProvider } from './identity-provider.js';

export const NOT_FOUND = '{"type":"about:blank","title":"Not Found","status":404}';

export type Api = TestApp & {
  idp: IdentityProvider;
  databaseUrl: string;
  // A fresh Owner with a valid token, so tests never share data.
  owner: () => Promise<{ sub: string; token: string }>;
  stop: () => Promise<void>;
};

/** The real app on a throwaway Postgres, with the fake identity provider. */
export async function startApi(): Promise<Api> {
  const db = await startDatabase();
  const idp = await createIdentityProvider();
  const api = await startApp({ idp, databaseUrl: db.url });
  return {
    ...api,
    idp,
    databaseUrl: db.url,
    owner: async () => {
      const sub = newOwner();
      return { sub, token: await idp.tokenFor(sub) };
    },
    stop: async () => {
      await api.close();
      await db.stop();
    },
  };
}

export async function expectProblem(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  return res.json();
}

export async function expectNotFound(res: Response) {
  expect(res.status).toBe(404);
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  expect(await res.text()).toBe(NOT_FOUND);
}

// The pointers of a 422, in order.
export async function expectInvalid(res: Response, pointers: string[]) {
  const body = await expectProblem(res, 422);
  expect(body.errors.map((e: { pointer: string }) => e.pointer)).toEqual(pointers);
  for (const error of body.errors) expect(error.detail).toEqual(expect.any(String));
}
