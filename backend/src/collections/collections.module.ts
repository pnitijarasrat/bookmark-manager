import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CollectionRepository } from './collection.repository.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CollectionsController],
  providers: [CollectionRepository, CollectionsService],
  exports: [CollectionRepository],
})
export class CollectionsModule {}
