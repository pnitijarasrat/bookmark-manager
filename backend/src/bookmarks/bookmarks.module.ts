import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BookmarkRepository } from './bookmark.repository.js';
import { BookmarksController, CollectionBookmarksController } from './bookmarks.controller.js';
import { BookmarksService } from './bookmarks.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BookmarksController, CollectionBookmarksController],
  providers: [BookmarkRepository, BookmarksService],
  exports: [BookmarkRepository],
})
export class BookmarksModule {}
