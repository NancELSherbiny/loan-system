// src/modules/repayments/repayments.module.ts
import { Module } from '@nestjs/common';
import { RepaymentsController } from './repayments.controller';
import { RepaymentsService } from './repayments.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { AuthModule } from '../../common/guards/auth.module';
import { RepaymentCalculationService } from './services/repayment-calculation.service';
import { RollbacksModule } from '../rollbacks/rollbacks.module';

@Module({
  imports: [AuthModule, RollbacksModule],
  controllers: [RepaymentsController],
  providers: [
    RepaymentsService,
    PrismaService,
    AuditService,
    LoggingInterceptor,
    RepaymentCalculationService,
  ],
})
export class RepaymentsModule {}
