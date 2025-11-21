import { Module } from '@nestjs/common';
import { RollbackService } from './rollback.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggingModule } from '../../common/logging/logging.module';

@Module({
  imports: [LoggingModule],
  providers: [RollbackService, PrismaService],
  exports: [RollbackService],
})
export class RollbacksModule {}
