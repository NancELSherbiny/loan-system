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
import { CreateDisbursementDto } from './dto/create-disbursement.dto';
import { AuditService } from '../audit/audit.service';
import { StructuredLoggerService } from '../../common/logging/structured-logger.service';
import { DisbursementStatus, LoanStatus, RepaymentScheduleStatus } from '../../common/utils/constants/status.constants';
import { RollbackService } from '../rollbacks/rollback.service'

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly structuredLogger: StructuredLoggerService,
    private readonly rollbackService: RollbackService,
  ) {}

  async disburseLoan(dto: CreateDisbursementDto, userId?: string) {
    // Generate unique transaction ID to prevent collisions
    const transactionId = `txn_${dto.loanId}_${Date.now()}`;
    const metadata = { loanId: dto.loanId, amount: dto.amount };

    this.structuredLogger.log({
      level: 'info',
      service: 'disbursement',
      operation: 'START_DISBURSEMENT',
      transactionId,
      userId: userId ?? dto.borrowerId,
      metadata,
    });

    try {
      return this.auditService.run(
        transactionId,
        'DISBURSEMENT',
        userId!,
        metadata,
        async (tx) => {
          // 1. Validate loan
          const loan = await this.assertLoanIsApproved(tx, dto.loanId, dto.borrowerId);
          this.ensurePositiveAmount(dto.amount);
          await this.ensurePlatformHasFunds(tx, dto.amount);

          // Idempotency log
          this.structuredLogger.log({
            level: 'debug',
            service: 'disbursement',
            operation: 'CHECK_IDEMPOTENCY',
            transactionId,
            userId: userId ?? dto.borrowerId,
            metadata: { prismaQuery: 'findUnique on disbursements' },
          });

          // 2. Create disbursement record
          const disbursement = await tx.disbursement.create({
            data: {
              loanId: loan.id,
              amount: dto.amount,
              disbursementDate: new Date(dto.disbursementDate),
              status: DisbursementStatus.COMPLETED,
            },
          });

          // 3. Generate repayment schedule
          const scheduleData = this.buildRepaymentSchedule(
            dto.amount,
            dto.interestRate,
            dto.tenor,
            new Date(dto.firstPaymentDate),
            loan.id,
          );
          await tx.repaymentSchedule.createMany({ data: scheduleData });

          this.structuredLogger.log({
            level: 'info',
            service: 'disbursement',
            operation: 'GENERATE_REPAYMENT_SCHEDULE',
            transactionId,
            userId: userId ?? dto.borrowerId,
            metadata: {
              tenor: dto.tenor,
              firstPaymentDate: dto.firstPaymentDate,
              // optional: calculatedMonthlyPayment: scheduleData[0].principalAmount + scheduleData[0].interestAmount,
            },
          });

          // 4. Update loan status
          await tx.loan.update({
            where: { id: loan.id },
            data: { status: LoanStatus.DISBURSED },
          });

          // 5. Domain‑specific audit entry
          await tx.auditLog.create({
            data: {
              transactionId,
              operation: 'DISBURSEMENT',
              userId,
              metadata: {
                step: 'generate_schedule',
                tenor: dto.tenor,
                firstPaymentDate: dto.firstPaymentDate,
              },
            },
          });

          // Disbursement completed log
          this.structuredLogger.log({
            level: 'info',
            service: 'disbursement',
            operation: 'DISBURSEMENT_COMPLETED',
            transactionId,
            userId: userId ?? dto.borrowerId,
          });

          return disbursement;
        },
      {
    idempotency: {
      check: (tx) =>
        tx.disbursement.findUnique({ where: { loanId: dto.loanId } }).then(Boolean),
      onDuplicate: () => {
        throw new ConflictException("Loan already disbursed");
      },
    },

    rollback: {
      canRollback: (tx) => 
        this.rollbackService.canRollbackDisbursementByLoan(tx, dto.loanId),

      compensate: (tx) =>
        this.rollbackService.compensateDisbursementByLoan(tx, dto.loanId),

      markRolledBack: (tx) =>
        this.rollbackService.markDisbursementRolledBackByLoan(tx, dto.loanId),
    },
  }
);
    } catch (error) {
      this.structuredLogger.log({
        level: 'error',
        service: 'disbursement',
        operation: 'DISBURSEMENT_FAILED',
        transactionId,
        userId: userId ?? dto.borrowerId,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
      });
      throw error;
    }
  }

 async getDisbursement(id: string) {
    try {
      // 1. Validate input
      if (!id || id.trim() === '') {
        throw new BadRequestException('Disbursement ID must be provided');
      }

      // 2. Query DB
      const disbursement = await this.prisma.disbursement.findUnique({
        where: { id },
      });

      // 3. Handle not found
      if (!disbursement) {
        throw new NotFoundException(`Disbursement with ID ${id} not found`);
      }

      this.logger.log(`Retrieved disbursement ${id}`);
      return disbursement;
    } catch (error) {
      // 4. Catch unexpected errors
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error; // rethrow known errors
      }

      this.logger.error(
        `Error fetching disbursement ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to fetch disbursement');
    }
  }

  async rollbackDisbursement(transactionId: string, reason: string) {
    this.logger.warn(`Rolling back disbursement ${transactionId} - ${reason}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const disbursement = await tx.disbursement.findUnique({
          where: { id: transactionId },
        });
        if (!disbursement) {
          throw new NotFoundException(
            `Disbursement with id ${transactionId} not found`,
          );
        }
        if (disbursement.status === DisbursementStatus.ROLLED_BACK) {
          throw new ConflictException('Disbursement already rolled back');
        }

        const updated = await tx.disbursement.update({
          where: { id: transactionId },
          data: { status: DisbursementStatus.ROLLED_BACK, rolledBackAt: new Date() },
        });

        await tx.rollbackRecord.create({
          data: {
            transactionId,
            originalOperation: 'DISBURSEMENT',
            rollbackReason: reason,
            compensatingActions: { reversed: true },
            rolledBackBy: 'system',
          },
        });

          await tx.loan.update({
            where: { id: disbursement.loanId },
            data: { status: LoanStatus.ROLLED_BACK },
          });

        await tx.auditLog.create({
          data: {
            transactionId,
            operation: 'ROLLBACK',
            metadata: { reason },
          },
        });

        this.logger.warn(`Rollback completed for disbursement ${transactionId}`);
        return updated;
      });
    } catch (error) {
      this.logger.error(
        `Rollback failed for disbursement ${transactionId}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to rollback disbursement');
    }
  }


  private async assertLoanIsApproved(
    tx: Prisma.TransactionClient,
    loanId: string,
    borrowerId: string,
  ) {
    const loan = await tx.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      throw new NotFoundException(`Loan ${loanId} not found`);
    }
    if (loan.borrowerId !== borrowerId) {
      throw new BadRequestException('Borrower mismatch for loan');
    }
    if (loan.status !== LoanStatus.APPROVED) {
      throw new ConflictException('Loan is not approved for disbursement');
    }
    return loan;
  }

  private ensurePositiveAmount(amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
  }

  private async ensurePlatformHasFunds(
    tx: Prisma.TransactionClient,
    requestedAmount: number,
  ) {
    const [totalDisbursed, totalPayments] = await Promise.all([
      tx.disbursement.aggregate({ _sum: { amount: true } }),
      tx.payment.aggregate({ _sum: { amount: true } }),
    ]);

    const available =
      this.toNumber(totalPayments._sum.amount) -
      this.toNumber(totalDisbursed._sum.amount);

    if (available < requestedAmount) {
      throw new BadRequestException('Insufficient platform funds');
    }
  }

  private buildRepaymentSchedule(
    principal: number,
    interestRate: number,
    tenor: number,
    firstDueDate: Date,
    loanId: string,
  ): Prisma.RepaymentScheduleCreateManyInput[] {
    const monthlyRate = interestRate / 100 / 12;
    const basePayment =
      monthlyRate === 0
        ? principal / tenor
        : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -tenor));

    let remainingPrincipal = principal;

    return Array.from({ length: tenor }).map((_, index) => {
      const interestPortion =
        monthlyRate === 0 ? 0 : remainingPrincipal * monthlyRate;
      let principalPortion = basePayment - interestPortion;

      if (index === tenor - 1) {
        principalPortion = remainingPrincipal;
      }

      remainingPrincipal = Math.max(remainingPrincipal - principalPortion, 0);

      return {
        loanId,
        installmentNumber: index + 1,
        dueDate: this.addMonths(firstDueDate, index),
        principalAmount: Number(principalPortion.toFixed(2)),
        interestAmount: Number(interestPortion.toFixed(2)),
        status: RepaymentScheduleStatus.PENDING,
      };
    });
  }

  private addMonths(date: Date, months: number) {
    const clone = new Date(date);
    clone.setMonth(clone.getMonth() + months);
    return clone;
  }

  private toNumber(value: Prisma.Decimal | null | undefined) {
    return value ? Number(value.toString()) : 0;
  }
}
