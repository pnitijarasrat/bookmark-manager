import { DEFAULT_ROUTE, loginPath, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each([
    '/bookmarks',
    '/bookmarks/5c1e?q=post',
    '/collections#top',
    '/bookmarks?collectionId=none',
  ])('keeps the relative in-app path %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    [undefined],
    [null],
    [''],
    ['bookmarks'],
    ['https://evil.example/'],
    ['//evil.example/path'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['javascript:alert(1)'],
    ['/login'],
    ['/login?returnTo=/bookmarks'],
    ['/callback?code=x'],
    [42],
  ])('falls back to the default route for %j', (value) => {
    expect(safeReturnTo(value)).toBe(DEFAULT_ROUTE);
  });

  it('is /bookmarks by default', () => {
    expect(DEFAULT_ROUTE).toBe('/bookmarks');
  });
});

describe('loginPath', () => {
  it('carries the path to return to', () => {
    expect(loginPath('/bookmarks/1?q=a b')).toBe('/login?returnTo=%2Fbookmarks%2F1%3Fq%3Da+b');
  });

  it('adds the reason when the session expired', () => {
    expect(loginPath('/collections', 'expired')).toBe(
      '/login?returnTo=%2Fcollections&reason=expired',
    );
  });
});
