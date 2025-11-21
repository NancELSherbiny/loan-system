import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggingModule } from '../../common/logging/logging.module';

@Module({
  imports: [LoggingModule],
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
