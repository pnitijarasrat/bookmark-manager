import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Imported only by the repository modules. See DECISIONS.md, "The Owner scope
// lives in a repository layer".
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
