import { Injectable, NotFoundException } from '@nestjs/common';
import { orNotFound } from '../prisma/errors.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

// A Collection as the API sees it: no ownerId. See API_DESIGN.md §1.
export type Collection = {
  id: string;
  name: string;
  bookmarkCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CollectionInput = { name: string };

const select = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  // The relation joins on (collection_id, owner_id), so only the Owner's
  // own Bookmarks are counted.
  _count: { select: { bookmarks: true } },
} as const;

type Row = Omit<Collection, 'bookmarkCount'> & { _count: { bookmarks: number } };

function toCollection({ _count, ...row }: Row): Collection {
  return { ...row, bookmarkCount: _count.bookmarks };
}

/**
 * Every method takes the Owner first, and every query filters on it. Another
 * Owner's Collection is indistinguishable from a missing one: both are the
 * same 404.
 */
@Injectable()
export class CollectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, input: CollectionInput): Promise<Collection> {
    const row = await this.prisma.collection.create({
      data: { ownerId, name: input.name },
      select,
    });
    return toCollection(row);
  }

  async findById(ownerId: string, id: string): Promise<Collection> {
    const row = await this.prisma.collection.findUnique({
      where: { id_ownerId: { id, ownerId } },
      select,
    });
    if (!row) throw new NotFoundException();
    return toCollection(row);
  }

  async update(ownerId: string, id: string, input: CollectionInput): Promise<Collection> {
    const row = await orNotFound(
      this.prisma.collection.update({
        where: { id_ownerId: { id, ownerId } },
        data: { name: input.name },
        select,
      }),
    );
    return toCollection(row);
  }

  // The database makes the Collection's Bookmarks Uncategorised in the same
  // statement (ON DELETE SET NULL (collection_id)).
  async delete(ownerId: string, id: string): Promise<void> {
    await orNotFound(
      this.prisma.collection.delete({ where: { id_ownerId: { id, ownerId } }, select: { id: true } }),
    );
  }
}
