import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditService } from './modules/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoggingModule } from './common/logging/logging.module';

// Import your feature modules
import { DisbursementsModule } from './modules/disbursements/disbursements.module';
import { AuthModule } from './common/guards/auth.module';

import { LoansModule } from './modules/loans/loans.module';
import { RepaymentsModule } from './modules/repayments/repayments.module';

@Module({
  imports: [
    AuthModule,
    LoggingModule,
    DisbursementsModule,
    LoansModule,
    RepaymentsModule,
    // HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, AuditService, PrismaService],
})
export class AppModule {}
