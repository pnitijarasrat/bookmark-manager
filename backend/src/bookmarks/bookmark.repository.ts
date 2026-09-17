import { Injectable, NotFoundException } from '@nestjs/common';
import { orNotFound } from '../prisma/not-found.js';
import { PrismaService } from '../prisma/prisma.service.js';

// A Bookmark as the API sees it: no ownerId. See API_DESIGN.md §1.
export type Bookmark = {
  id: string;
  url: string;
  title: string;
  notes: string;
  collectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BookmarkInput = {
  url: string;
  title: string;
  notes?: string;
  collectionId?: string | null;
};

// Absent fields are left unchanged. `collectionId: null` makes it Uncategorised.
export type BookmarkChanges = Partial<BookmarkInput>;

const select = {
  id: true,
  url: true,
  title: true,
  notes: true,
  collectionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Every method takes the Owner first, and every query filters on it. Another
 * Owner's Bookmark, or a `collectionId` naming another Owner's Collection, is
 * indistinguishable from a missing one: both are the same 404.
 */
@Injectable()
export class BookmarkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, input: BookmarkInput): Promise<Bookmark> {
    if (input.collectionId) await this.assertCollection(ownerId, input.collectionId);
    return orNotFound(
      this.prisma.bookmark.create({
        data: {
          ownerId,
          url: input.url,
          title: input.title,
          notes: input.notes,
          collectionId: input.collectionId,
        },
        select,
      }),
    );
  }

  async findById(ownerId: string, id: string): Promise<Bookmark> {
    const row = await this.prisma.bookmark.findUnique({
      where: { id_ownerId: { id, ownerId } },
      select,
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  async update(ownerId: string, id: string, changes: BookmarkChanges): Promise<Bookmark> {
    if (changes.collectionId) await this.assertCollection(ownerId, changes.collectionId);
    return orNotFound(
      this.prisma.bookmark.update({
        where: { id_ownerId: { id, ownerId } },
        data: {
          url: changes.url,
          title: changes.title,
          notes: changes.notes,
          collectionId: changes.collectionId,
        },
        select,
      }),
    );
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await orNotFound(
      this.prisma.bookmark.delete({ where: { id_ownerId: { id, ownerId } }, select: { id: true } }),
    );
  }

  // A clean 404 before writing. If the Collection is deleted after this check,
  // the composite foreign key fails (P2003) and orNotFound gives the same 404.
  private async assertCollection(ownerId: string, collectionId: string): Promise<void> {
    const found = await this.prisma.collection.findUnique({
      where: { id_ownerId: { id: collectionId, ownerId } },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
  }
}
