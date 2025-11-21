
// src/common/rollbacks/rollback.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IRollbackService, RollbackRecord, Action as RollbackAction, OriginalOperation } from './interfaces/rollback.interface';
import { Prisma } from '@prisma/client';
import { DisbursementStatus, LoanStatus } from '../../common/utils/constants/status.constants';


@Injectable()
export class RollbackService implements IRollbackService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------
  // SERIALIZE ACTIONS FOR PRISMA JSON
  // ---------------------------------------------
  private serializeActions(actions: RollbackAction[]): Prisma.InputJsonValue {
    const serialized = actions.map((action) => ({
      ...action,
      timestamp: action.timestamp instanceof Date ? action.timestamp.toISOString() : action.timestamp,
    }));
    return serialized as unknown as Prisma.InputJsonValue;
  }

  // ---------------------------------------------
  // CAN ROLLBACK CHECK
  // ---------------------------------------------
  async canRollback(transactionId: string): Promise<boolean> {
    const existing = await this.prisma.rollbackRecord.findFirst({
      where: { transactionId },
    });
    return !existing;
  }

  // ---------------------------------------------
  // ROLLBACK TRANSACTION
  // ---------------------------------------------
  async rollbackTransaction(transactionId: string, reason: string): Promise<RollbackRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Check existing rollback
      const already = await tx.rollbackRecord.findFirst({ where: { transactionId } });
      if (already) throw new BadRequestException('Transaction already rolled back');

      // Determine original operation from audit logs
      const logs = await tx.auditLog.findMany({
        where: { transactionId, operation: { in: ['DISBURSEMENT', 'REPAYMENT'] } },
        orderBy: { createdAt: 'asc' },
      });
      if (!logs.length) throw new NotFoundException('Transaction not found');

      const originalOperation = logs[0].operation as OriginalOperation;

      // Execute compensating actions
      let actions: RollbackAction[] = [];
      if (originalOperation === 'disbursement') {
        actions = await this.rollbackDisbursement(tx, transactionId);
      } else if (originalOperation === 'repayment') {
        actions = await this.rollbackRepayment(tx, transactionId);
      }

      // Save rollback record in DB (type-safe)
      const rbPrisma = await tx.rollbackRecord.create({
        data: {
          transactionId,
          originalOperation,
          rollbackReason: reason,
          compensatingActions: this.serializeActions(actions),
          rolledBackBy: 'system',
        },
      });

      // Map Prisma result → RollbackRecord interface
      const rb: RollbackRecord = {
        transactionId: rbPrisma.transactionId,
        originalOperation: rbPrisma.originalOperation as OriginalOperation,
        rollbackReason: rbPrisma.rollbackReason,
        rollbackTimestamp: rbPrisma.createdAt,
        compensatingActions: rbPrisma.compensatingActions as unknown as RollbackAction[],
        rolledBackBy: rbPrisma.rolledBackBy ?? 'system',
      };

      return rb;
    });
  }

  // ---------------------------------------------
  // ROLLBACK DISBURSEMENT
  // ---------------------------------------------
  private async rollbackDisbursement(tx: any, transactionId: string): Promise<RollbackAction[]> {
    const disb = await tx.disbursement.findFirst({ where: { id: transactionId } });
    if (!disb) throw new NotFoundException('Original disbursement not found');

    await tx.disbursement.update({
      where: { id: disb.id },
      data: { rolledBackAt: new Date(), status: 'ROLLED_BACK' },
    });

    const reverse = await tx.payment.create({
      data: {
        loanId: disb.loanId,
        amount: disb.amount.neg(),
        paymentDate: new Date(),
        principalPaid: 0,
        interestPaid: 0,
        lateFeePaid: 0,
        daysLate: 0,
        status: 'REVERSAL',
      },
    });

    return [
      {
        type: 'reverse_disbursement',
        detail: { reversePaymentId: reverse.id },
        timestamp: new Date(),
      },
    ];
  }

  // ---------------------------------------------
  // ROLLBACK REPAYMENT
  // ---------------------------------------------
  private async rollbackRepayment(tx: any, transactionId: string): Promise<RollbackAction[]> {
    const payment = await tx.payment.findFirst({ where: { id: transactionId } });
    if (!payment) throw new NotFoundException('Original repayment not found');

    await tx.payment.update({
      where: { id: payment.id },
      data: { rolledBackAt: new Date(), status: 'ROLLED_BACK' },
    });

    const reverse = await tx.payment.create({
      data: {
        loanId: payment.loanId,
        amount: payment.amount.neg(),
        paymentDate: new Date(),
        principalPaid: payment.principalPaid.neg(),
        interestPaid: payment.interestPaid.neg(),
        lateFeePaid: payment.lateFeePaid.neg(),
        daysLate: 0,
        status: 'REVERSAL',
      },
    });

    const schedules = await tx.repaymentSchedule.findMany({
      where: { loanId: payment.loanId, paidDate: { not: null } },
    });

    const actions: RollbackAction[] = [
      { type: 'reverse_payment', detail: { reversePaymentId: reverse.id }, timestamp: new Date() },
    ];

    for (const sched of schedules) {
      await tx.repaymentSchedule.update({
        where: { id: sched.id },
        data: { paidDate: null, status: 'PENDING' },
      });

      actions.push({
        type: 'revert_schedule',
        detail: { scheduleId: sched.id },
        timestamp: new Date(),
      });
    }

    return actions;
  }

  // ---------------------------------------------
  // GET AUDIT TRAIL
  // ---------------------------------------------
  async getAuditTrail(transactionId: string) {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
    });

    const rollbackRecords = await this.prisma.rollbackRecord.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
    });

    return { auditLogs, rollbackRecords };
  }

  // src/common/rollbacks/rollback.service.ts
// Add these public helpers to your RollbackService class

/**
 * Check by loanId whether a disbursement can be rolled back.
 * Used by external services (inside a transaction).
 */
async canRollbackDisbursementByLoan(tx: Prisma.TransactionClient, loanId: string): Promise<boolean> {
  const disb = await tx.disbursement.findFirst({ where: { loanId } });
  return !!disb && !disb.rolledBackAt;
}

/**
 * Compensate a disbursement by loanId: delete schedules, revert loan status, ...
 * Returns the list of actions (RollbackAction[]) — NOT persisted here.
 * Caller should persist the rollback record (or let AuditService do it).
 */
async compensateDisbursementByLoan(tx: Prisma.TransactionClient, loanId: string): Promise<RollbackAction[]> {
  // delete repayment schedules
  const del = await tx.repaymentSchedule.deleteMany({ where: { loanId } });

  // revert loan status to APPROVED
  await tx.loan.update({
    where: { id: loanId },
    data: { status: LoanStatus.APPROVED }, // import LoanStatus const where needed
  });

  const actions: RollbackAction[] = [
    { type: 'delete_schedules', detail: { count: del.count }, timestamp: new Date() },
    { type: 'loan_status', detail: { status: LoanStatus.APPROVED }, timestamp: new Date() },
  ];

  return actions;
}

/**
 * Mark the disbursement (by loanId) as rolled back.
 */
async markDisbursementRolledBackByLoan(tx: Prisma.TransactionClient, loanId: string): Promise<void> {
  await tx.disbursement.update({
    where: { loanId },
    data: { status: DisbursementStatus.ROLLED_BACK, rolledBackAt: new Date() },
  });
}

}
