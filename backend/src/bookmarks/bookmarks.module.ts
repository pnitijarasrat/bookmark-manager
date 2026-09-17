import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BookmarkRepository } from './bookmark.repository.js';

@Module({
  imports: [PrismaModule],
  providers: [BookmarkRepository],
  exports: [BookmarkRepository],
})
export class BookmarksModule {}
