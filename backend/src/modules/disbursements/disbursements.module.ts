// src/modules/disbursements/disbursements.module.ts
import { Module } from '@nestjs/common';
import { DisbursementsController } from './disbursements.controller';
import { DisbursementService } from './disbursements.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthModule } from '../../common/guards/auth.module';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { AuditService } from '../audit/audit.service';
import { RollbacksModule } from '../rollbacks/rollbacks.module';

@Module({
  imports: [AuthModule, RollbacksModule],
  controllers: [DisbursementsController],
  providers: [
    DisbursementService,
    PrismaService,
    LoggingInterceptor,
    AuditService,
  ],
  exports: [DisbursementService],
})
export class DisbursementsModule {}
