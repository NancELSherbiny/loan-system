// src/modules/repayments/repayments.service.ts
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, Loan, RepaymentSchedule } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructuredLoggerService } from '../../common/logging/structured-logger.service';
import { CreateRepaymentDto } from './dto/create-repayement.dto';
import { RepaymentCalculationService } from './services/repayment-calculation.service';
import { AuditService } from '../audit/audit.service';
import { AuditContextService } from 'src/modules/audit/audit-context.service';
import { RollbackService } from '../rollbacks/rollback.service';
import { LoanSnapshot, RepaymentDueSummary } from './interfaces/repayment.interface';
import { RepaymentHistoryQueryDto } from './dto/repayment-history-query.dto';

const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;



@Injectable()
export class RepaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly structuredLogger: StructuredLoggerService,
    private readonly context: AuditContextService,
    private readonly calcService: RepaymentCalculationService,
    private readonly rollbackService : RollbackService,
  ) {}

  async processRepayment(dto: CreateRepaymentDto, userId?: string) {
    if (dto.amount <= 0) throw new BadRequestException('Payment amount must be positive');

    const transactionId = `txn_${dto.loanId}_${Date.now()}`;
    const paymentDate = new Date(dto.paymentDate);
    const effectiveUserId = userId ?? 'system'; // fix TypeScript issue
try{
    return this.auditService.run(
      transactionId,
      'REPAYMENT',
      effectiveUserId,
      { loanId: dto.loanId, amount: dto.amount, paymentDate },
      async (tx) => {
        const snapshot = await this.buildLoanSnapshot(tx, dto.loanId, paymentDate);

        if (snapshot.outstandingPrincipal <= 0) {
          throw new ConflictException('Loan is already fully repaid');
        }

        // 1️⃣ Calculate interest, late fee, total due
        const {
          calculation,
          principalPortion,
          interestPortion,
          lateFeePortion,
          excessAmount,
        } = this.calculateBreakdown(snapshot, dto.amount, paymentDate);

        this.log('info', {
          event: 'repayment_calculation',
          loanId: dto.loanId,
          paymentAmount: dto.amount,
          ...calculation,
        });

        const totalApplied = principalPortion + interestPortion + lateFeePortion;
        const paymentStatus = totalApplied >= calculation.totalDue ? 'COMPLETED' : 'PARTIAL';

        // 2️⃣ Create payment record
        const payment = await tx.payment.create({
          data: {
            loanId: dto.loanId,
            amount: dto.amount,
            paymentDate,
            principalPaid: principalPortion,
            interestPaid: interestPortion,
            lateFeePaid: lateFeePortion,
            daysLate: calculation.daysLate,
            status: paymentStatus,
          },
        });

        // 3️⃣ Update current schedule
        await this.updateSchedule(tx, snapshot.nextSchedule, paymentDate, principalPortion);

        // 4️⃣ Handle overpayment
        let allocationSummary: { scheduleId: string; appliedAmount: number }[] = [];
        let remainingExcess = 0;

        if (excessAmount > 0) {
          const result = await this.applyOverpayment(tx, dto.loanId, paymentDate, excessAmount);
          remainingExcess = this.round2(result.remainingExcess ?? 0);
          allocationSummary = result.allocationSummary ?? [];

          this.log('info', {
            event: 'repayment_excess',
            loanId: dto.loanId,
            excessAmount,
            remainingExcess,
            allocationSummary,
            note: 'Excess payment applied to future installments',
          });
        }

        // 5️⃣ Audit log
        await tx.auditLog.create({
          data: {
            transactionId,
            operation: 'REPAYMENT',
            userId: effectiveUserId,
            metadata: {
              event: 'repayment_processed',
              loanId: dto.loanId,
              paymentId: payment.id,
              calculation: { ...calculation },
              excessApplied: allocationSummary,
              remainingExcess,
            } as unknown as Prisma.JsonObject,
          },
        });

        this.log('info', {
          event: 'repayment_persisted',
          loanId: dto.loanId,
          paymentId: payment.id,
          calculation,
        });

        return {
          payment,
          calculation,
          excessAmount: this.round2(excessAmount),
          remainingExcess,
          allocationSummary,
        };
      },
    );
  } catch(err) {
    // Automatic rollback on failure
    try {
      await this.rollbackService.rollbackTransaction(transactionId, 'Repayment failed due to error');
    } catch (rollbackErr) {
      this.log('error', {
        event: 'repayment_rollback_failed',
        transactionId,
        error: rollbackErr,
      });
    }
    throw err;
  }
}

  // Apply overpayment to future schedules
  private async applyOverpayment(
    tx: Prisma.TransactionClient,
    loanId: string,
    paymentDate: Date,
    excessAmount: number,
  ) {
    const pendingSchedules = await tx.repaymentSchedule.findMany({
      where: { loanId, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: { dueDate: 'asc' },
    });

    let remainingExcess = excessAmount;
    const allocationSummary: { scheduleId: string; appliedAmount: number }[] = [];

    for (const schedule of pendingSchedules) {
      if (remainingExcess <= 0) break;

      const scheduledPrincipal = this.toNumber(schedule.principalAmount);
      const principalToPay = Math.min(scheduledPrincipal, remainingExcess);

      await tx.payment.create({
        data: {
          loanId,
          amount: principalToPay,
          paymentDate,
          principalPaid: principalToPay,
          interestPaid: 0,
          lateFeePaid: 0,
          daysLate: 0,
          status: principalToPay >= scheduledPrincipal ? 'COMPLETED' : 'PARTIAL',
        },
      });

      await this.updateSchedule(tx, schedule, paymentDate, principalToPay);

      allocationSummary.push({ scheduleId: schedule.id, appliedAmount: principalToPay });
      remainingExcess -= principalToPay;
    }

    return { remainingExcess, allocationSummary };
  }

  async getRepaymentHistory( loanId: string, query?: RepaymentHistoryQueryDto, ) 
  { const where: Prisma.PaymentWhereInput = { loanId }; 
  if (query?.from || query?.to) { where.paymentDate = {}; 
  if (query.from) where.paymentDate.gte = new Date(query.from); 
  if (query.to) where.paymentDate.lte = new Date(query.to); } 
  return this.prisma.payment.findMany({ where, orderBy: { paymentDate: 'asc' }, }); } 
  
  async getRepaymentSchedule(loanId: string) 
  { return this.prisma.repaymentSchedule.findMany({ where: { loanId }, 
    orderBy: { installmentNumber: 'asc' }, }); } 
    
  async calculateCurrentDue( loanId: string, asOfDate: Date = new Date(), ): Promise<RepaymentDueSummary> { 
    const snapshot = await this.buildLoanSnapshot(this.prisma, loanId, asOfDate); 
    const interestRate = this.toNumber(snapshot.loan.interestRate); 
    // Calculate interest day-by-day, accounting for principal reductions from payments 
    const accruedInterest = this.calcService.calculateDailyInterestWithPrincipalReductions( snapshot.principalAtStartOfPeriod, interestRate, snapshot.lastPaymentDate, asOfDate, snapshot.paymentsInPeriod, this.isLeapYear(asOfDate.getFullYear()), ); 
    const dueDate = snapshot.nextSchedule?.dueDate ? new Date(snapshot.nextSchedule.dueDate) : this.addMonths(snapshot.lastPaymentDate, 1); const daysLate = Math.max(this.diffInDays(asOfDate, dueDate) - 3, 0); // 3-day grace 
    const lateFee = this.calcService.calculateLateFee(daysLate); const scheduledPrincipal = snapshot.nextSchedule ? this.toNumber(snapshot.nextSchedule.principalAmount) : snapshot.outstandingPrincipal; 
    const totalDue = this.round2( accruedInterest + lateFee + Math.min(scheduledPrincipal, snapshot.outstandingPrincipal), ); 
    return { outstandingPrincipal: this.round2(snapshot.outstandingPrincipal), accruedInterest: this.round2(accruedInterest), lateFee, totalDue, daysLate, nextDueDate: dueDate, nextInstallmentNumber: snapshot.nextSchedule?.installmentNumber ?? null, scheduledPrincipal: this.round2(Math.min(scheduledPrincipal, snapshot.outstandingPrincipal)), }; }

  // --- Helper methods for calculation, snapshot, schedule update ---
  private async buildLoanSnapshot(
    tx: Prisma.TransactionClient | PrismaService,
    loanId: string,
    paymentDate: Date,
  ): Promise<LoanSnapshot> {
    const loan = await tx.loan.findUnique({
      where: { id: loanId },
      include: { disbursement: true },
    });
    if (!loan) throw new ConflictException('Loan not found');

    const [lastPayment, principalAggregate, nextSchedule, allPayments] = await Promise.all([
      tx.payment.findFirst({
        where: { loanId },
        orderBy: { paymentDate: 'desc' },
      }),
      tx.payment.aggregate({ where: { loanId }, _sum: { principalPaid: true } }),
      tx.repaymentSchedule.findFirst({
        where: { loanId, status: { in: ['PENDING', 'PARTIAL'] } },
        orderBy: { dueDate: 'asc' },
      }),
      tx.payment.findMany({
        where: { loanId },
        orderBy: { paymentDate: 'asc' },
        select: { paymentDate: true, principalPaid: true },
      }),
    ]);

    const lastRelevantDate =
      lastPayment?.paymentDate ?? nextSchedule?.dueDate ?? loan.disbursement?.disbursementDate ?? loan.createdAt;

    const paymentsBeforePeriod = allPayments.filter((p) => new Date(p.paymentDate) < lastRelevantDate);
    const principalPaidBeforePeriod = paymentsBeforePeriod.reduce((sum, p) => sum + this.toNumber(p.principalPaid), 0);
    const principalAtStartOfPeriod = Math.max(this.toNumber(loan.amount) - principalPaidBeforePeriod, 0);

    const paymentsInPeriod = allPayments
      .filter((p) => {
        const pDate = new Date(p.paymentDate);
        return pDate >= lastRelevantDate && pDate < paymentDate;
      })
      .map((p) => ({ paymentDate: new Date(p.paymentDate), principalPaid: this.toNumber(p.principalPaid) }));

    const outstandingPrincipal = Math.max(this.toNumber(loan.amount) - this.toNumber(principalAggregate._sum.principalPaid), 0);

    return { loan, outstandingPrincipal, lastPaymentDate: lastRelevantDate, nextSchedule, daysSinceLastPayment: Math.max(this.diffInDays(paymentDate, lastRelevantDate), 0), paymentsInPeriod, principalAtStartOfPeriod };
  }

  private calculateBreakdown(
    snapshot: LoanSnapshot,
    paymentAmount: number,
    paymentDate: Date,
  ) {
    const interestPortion = this.calcService.calculateDailyInterestWithPrincipalReductions(
      snapshot.principalAtStartOfPeriod,
      this.toNumber(snapshot.loan.interestRate),
      snapshot.lastPaymentDate,
      paymentDate,
      snapshot.paymentsInPeriod,
      this.isLeapYear(paymentDate.getFullYear()),
    );

    const dueDate = snapshot.nextSchedule?.dueDate ? new Date(snapshot.nextSchedule.dueDate) : this.addMonths(snapshot.lastPaymentDate, 1);
    const daysLate = Math.max(this.diffInDays(paymentDate, dueDate) - 3, 0);
    const lateFeePortion = this.calcService.calculateLateFee(daysLate);

    const allocation = this.calcService.allocatePayment(paymentAmount, interestPortion, lateFeePortion, snapshot.outstandingPrincipal);
    const totalApplied = allocation.principalPaid + allocation.interestPaid + allocation.lateFeePaid;
    const excessAmount = paymentAmount - totalApplied;

    const scheduledPrincipal = snapshot.nextSchedule ? this.toNumber(snapshot.nextSchedule.principalAmount) : snapshot.outstandingPrincipal;
    const totalDue = this.round2(Math.min(scheduledPrincipal, snapshot.outstandingPrincipal) + interestPortion + lateFeePortion);

    return {
      calculation: { outstandingPrincipal: this.round2(snapshot.outstandingPrincipal), accruedInterest: this.round2(interestPortion), lateFee: lateFeePortion, totalDue, daysLate },
      principalPortion: allocation.principalPaid,
      interestPortion: allocation.interestPaid,
      lateFeePortion: allocation.lateFeePaid,
      excessAmount,
    };
  }

  private async updateSchedule(
    tx: Prisma.TransactionClient,
    schedule: RepaymentSchedule | null | undefined,
    paidDate: Date,
    principalPortion: number,
  ) {
    if (!schedule) return;
    const remaining = Math.max(this.toNumber(schedule.principalAmount) - principalPortion, 0);
    const status = remaining <= 0.01 ? 'PAID' : 'PARTIAL';
    await tx.repaymentSchedule.update({ where: { id: schedule.id }, data: { status, paidDate } });
  }

  private diffInDays(later: Date, earlier: Date) {
    return Math.floor((later.getTime() - earlier.getTime()) / MILLIS_PER_DAY);
  }

  private addMonths(date: Date, months: number) {
    const clone = new Date(date);
    clone.setMonth(clone.getMonth() + months);
    return clone;
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private isLeapYear(year: number) {
    if (year % 4 !== 0) return false;
    if (year % 100 !== 0) return true;
    return year % 400 === 0;
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', metadata: Record<string, any>) {
    const ctx = this.context.getContext();
    if (!ctx) return;
    this.structuredLogger.log({
      level,
      service: 'repayment',
      operation: ctx.operation,
      transactionId: ctx.transactionId,
      userId: ctx.userId,
      metadata,
    });
  }
}
