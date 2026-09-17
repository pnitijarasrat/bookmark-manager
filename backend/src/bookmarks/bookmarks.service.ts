import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { decodeCursor, nextCursor } from '../http/cursor.js';
import { DEFAULT_LIMIT, type ListQuery } from '../http/list.dto.js';
import type { BookmarkDto, BookmarkPageDto } from './bookmark.dto.js';
import {
  BookmarkRepository,
  type BookmarkChanges,
  type BookmarkInput,
  type BookmarkKey,
} from './bookmark.repository.js';

/** Bookmarks, always for one Owner, passed first. */
@Injectable()
export class BookmarksService {
  constructor(private readonly bookmarks: BookmarkRepository) {}

  /**
   * One page of Bookmarks. `collectionId` is a Collection's id, `null` for
   * Uncategorised only, or absent for all. GET /bookmarks?collectionId= and
   * GET /collections/:id/bookmarks both come here.
   */
  async list(ownerId: string, query: ListQuery, collectionId?: string | null): Promise<BookmarkPageDto> {
    const page = await this.bookmarks.list(ownerId, {
      limit: query.limit ?? DEFAULT_LIMIT,
      after: query.cursor === undefined ? undefined : decodeCursor(query.cursor, parseKey),
      q: query.q,
      collectionId,
    });
    return {
      items: page.items,
      nextCursor: nextCursor(page, ({ createdAt, id }) => ({ createdAt: createdAt.toISOString(), id })),
    };
  }

  create(ownerId: string, input: BookmarkInput): Promise<BookmarkDto> {
    return this.bookmarks.create(ownerId, input);
  }

  get(ownerId: string, id: string): Promise<BookmarkDto> {
    return this.bookmarks.findById(ownerId, id);
  }

  update(ownerId: string, id: string, changes: BookmarkChanges): Promise<BookmarkDto> {
    return this.bookmarks.update(ownerId, id, changes);
  }

  delete(ownerId: string, id: string): Promise<void> {
    return this.bookmarks.delete(ownerId, id);
  }
}

/**
 * The `collectionId` query filter: `none` is Uncategorised, and anything else
 * must be a UUID. A bad value names no Collection, so it's the same 404 as a
 * Collection that isn't the caller's.
 */
export function parseCollectionFilter(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'none') return null;
  if (!isUUID(value)) throw new NotFoundException();
  return value;
}

function parseKey({ createdAt, id }: Record<string, unknown>): BookmarkKey | undefined {
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !isUUID(id)) return undefined;
  const date = new Date(createdAt);
  // Only the exact form this API issues, so the date round-trips.
  return !Number.isNaN(date.getTime()) && date.toISOString() === createdAt ? { createdAt: date, id } : undefined;
}
