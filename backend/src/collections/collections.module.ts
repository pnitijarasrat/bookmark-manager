import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CollectionRepository } from './collection.repository.js';

@Module({
  imports: [PrismaModule],
  providers: [CollectionRepository],
  exports: [CollectionRepository],
})
export class CollectionsModule {}
