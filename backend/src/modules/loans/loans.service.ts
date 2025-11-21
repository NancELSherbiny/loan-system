// src/modules/loans/loans.service.ts
import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getLoan(id: string) {
  const loan = await this.prisma.loan.findUnique({ where: { id } });
  if (!loan) throw new NotFoundException(`Loan ${id} not found`);
  return loan;
}

  async getAuditTrail(loanId: string) {
  // Find disbursement/payment transactions for this loan
  const disbursement = await this.prisma.disbursement.findUnique({ where: { loanId } });
  const payments = await this.prisma.payment.findMany({ where: { loanId } });

  const transactionIds = [
    ...(disbursement ? [disbursement.id] : []),
    ...payments.map(p => p.id),
  ];

  return this.prisma.auditLog.findMany({
    where: { transactionId: { in: transactionIds } },
    orderBy: { createdAt: 'asc' },
  });
}
}