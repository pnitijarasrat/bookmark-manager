import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { decodeCursor, nextCursor } from '../http/cursor.js';
import { DEFAULT_LIMIT, type ListQuery } from '../http/list.dto.js';
import type { CollectionDto, CollectionPageDto } from './collection.dto.js';
import {
  CollectionRepository,
  type CollectionChanges,
  type CollectionInput,
  type CollectionKey,
} from './collection.repository.js';

/** Collections, always for one Owner, passed first. */
@Injectable()
export class CollectionsService {
  constructor(private readonly collections: CollectionRepository) {}

  async list(ownerId: string, query: ListQuery): Promise<CollectionPageDto> {
    const page = await this.collections.list(ownerId, {
      limit: query.limit ?? DEFAULT_LIMIT,
      after: query.cursor === undefined ? undefined : decodeCursor(query.cursor, parseKey),
      q: query.q,
    });
    return { items: page.items, nextCursor: nextCursor(page, ({ name, id }) => ({ name, id })) };
  }

  create(ownerId: string, input: CollectionInput): Promise<CollectionDto> {
    return this.collections.create(ownerId, input);
  }

  get(ownerId: string, id: string): Promise<CollectionDto> {
    return this.collections.findById(ownerId, id);
  }

  update(ownerId: string, id: string, changes: CollectionChanges): Promise<CollectionDto> {
    return this.collections.update(ownerId, id, changes);
  }

  delete(ownerId: string, id: string): Promise<void> {
    return this.collections.delete(ownerId, id);
  }
}

function parseKey({ name, id }: Record<string, unknown>): CollectionKey | undefined {
  return typeof name === 'string' && typeof id === 'string' && isUUID(id) ? { name, id } : undefined;
}
