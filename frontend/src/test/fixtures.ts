import type { Bookmark, Collection } from '../api/types';

export function aCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: '0b9f0000-0000-4000-8000-000000000001',
    name: 'Reading',
    bookmarkCount: 0,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

export function aBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: '5c1e0000-0000-4000-8000-000000000001',
    url: 'https://example.com/post',
    title: 'A post',
    notes: '',
    collectionId: null,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

export function page<T>(items: T[], nextCursor: string | null = null) {
  return Response.json({ items, nextCursor });
}
