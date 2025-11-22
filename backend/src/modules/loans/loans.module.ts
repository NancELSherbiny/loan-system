import { Module } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LoanService } from './loans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { AuthModule } from '../../common/guards/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LoansController],
  providers: [LoanService, PrismaService, LoggingInterceptor],
})
export class LoansModule {}
