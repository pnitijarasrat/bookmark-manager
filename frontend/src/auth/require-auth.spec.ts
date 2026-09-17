import { contextWith, fakeSession } from '../test/session';
import { requireAuth } from './require-auth';

function run(url: string, session = fakeSession()) {
  const next = vi.fn(async () => new Response('page'));
  const request = new Request(url);
  const result = Promise.resolve().then(() =>
    requireAuth(
      { request, url: new URL(url), params: {}, context: contextWith(session), pattern: '' },
      next,
    ),
  );
  return { result, next };
}

describe('requireAuth', () => {
  it('lets a signed-in User through', async () => {
    const { result, next } = run('http://localhost:3000/bookmarks?q=a');
    await result;
    expect(next).toHaveBeenCalledOnce();
  });

  it('sends a signed-out visitor to /login with the path to return to', async () => {
    const { result, next } = run(
      'http://localhost:3000/bookmarks/1?q=a',
      fakeSession({ isAuthenticated: false }),
    );
    const thrown = await result.then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fbookmarks%2F1%3Fq%3Da',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves a Load more cursor out of the path to return to', async () => {
    const { result } = run(
      'http://localhost:3000/bookmarks?q=a&cursor=next-1',
      fakeSession({ isAuthenticated: false }),
    );
    const thrown = await result.then(
      () => null,
      (error: unknown) => error,
    );
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?returnTo=%2Fbookmarks%3Fq%3Da',
    );
  });
});
