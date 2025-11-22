import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RollbackService } from './rollback.service';

describe('RollbackService', () => {
  let service: RollbackService;
  let prisma: any;

  // Utility to create a mock transaction (tx) object that mirrors prisma shape
  const makeTx = () => ({
    rollbackRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    disbursement: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    repaymentSchedule: {
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    loan: {
      update: jest.fn(),
    },
  });

  beforeEach(() => {
    // prisma.$transaction will call the callback with a transaction-like object (tx)
    prisma = {
      rollbackRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((fn) => {
        // create fresh tx for each transaction call
        const tx = makeTx();
        return fn(tx);
      }),
    };

    service = new RollbackService(prisma as any);
  });

  // -------------------------
  // canRollback()
  // -------------------------
  it('canRollback returns true when no existing rollback record', async () => {
    prisma.rollbackRecord.findFirst.mockResolvedValue(null);
    const ok = await service.canRollback('txn1');
    expect(prisma.rollbackRecord.findFirst).toHaveBeenCalledWith({
      where: { transactionId: 'txn1' },
    });
    expect(ok).toBe(true);
  });

  it('canRollback returns false when an existing rollback record exists', async () => {
    prisma.rollbackRecord.findFirst.mockResolvedValue({ id: 'rb1' });
    const ok = await service.canRollback('txn1');
    expect(ok).toBe(false);
  });

  // -------------------------
  // rollbackTransaction - errors
  // -------------------------
  it('rollbackTransaction throws BadRequestException when already rolled back', async () => {
    // tx.rollbackRecord.findFirst will be truthy
    prisma.$transaction = jest.fn((fn) => {
      const tx = makeTx();
      tx.rollbackRecord.findFirst.mockResolvedValue({ id: 'exists' });
      return fn(tx);
    });

    await expect(service.rollbackTransaction('txn-x', 'reason')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rollbackTransaction throws NotFoundException when no audit logs found', async () => {
    prisma.$transaction = jest.fn((fn) => {
      const tx = makeTx();
      tx.rollbackRecord.findFirst.mockResolvedValue(null);
      tx.auditLog.findMany.mockResolvedValue([]);
      return fn(tx);
    });

    await expect(service.rollbackTransaction('txn-notfound', 'r')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // -------------------------
  // rollbackTransaction - disbursement flow
  // -------------------------
  it('rollbackTransaction performs disbursement rollback and returns rollback record', async () => {
    const fakeDisb = { id: 'd1', loanId: 'L1', amount: { neg: () => -1000 } };

    prisma.$transaction = jest.fn(async (fn) => {
      const tx = makeTx();
      tx.rollbackRecord.findFirst.mockResolvedValue(null);

      // Simulate auditLog showing a disbursement as original operation (lowercase, matching service check)
      tx.auditLog.findMany.mockResolvedValue([{ operation: 'disbursement' }]);

      tx.disbursement.findFirst.mockResolvedValue(fakeDisb);
      tx.disbursement.update.mockResolvedValue({ ...fakeDisb, status: 'ROLLED_BACK' });
      tx.payment.create.mockResolvedValue({ id: 'rev1' });

      // When creating rollbackRecord -> return a prisma-like record
      tx.rollbackRecord.create.mockResolvedValue({
        transactionId: 'txn-d',
        originalOperation: 'disbursement',
        rollbackReason: 'test-reason',
        compensatingActions: [{ type: 'reverse_disbursement', detail: { reversePaymentId: 'rev1' } }],
        rolledBackBy: 'system',
        createdAt: new Date(),
      });

      return fn(tx);
    });

    const result = await service.rollbackTransaction('txn-d', 'test-reason');

    // verify result maps fields from created prisma row
    expect(result.transactionId).toBe('txn-d');
    expect(result.originalOperation).toBe('disbursement');
    expect(result.rollbackReason).toBe('test-reason');

    // ensure we updated disbursement and created reverse payment
    // (we assert indirectly by expecting the returned actions include the reverse)
    expect(Array.isArray(result.compensatingActions)).toBe(true);
    expect(result.compensatingActions[0].type).toBe('reverse_disbursement');
  });

  // -------------------------
  // rollbackTransaction - repayment flow
  // -------------------------
  it('rollbackTransaction performs repayment rollback and reverts schedules', async () => {
    // create "number-like" fields with neg() helper used in code
    const fakePayment = {
      id: 'p1',
      loanId: 'L2',
      amount: { neg: () => -200 },
      principalPaid: { neg: () => -150 },
      interestPaid: { neg: () => -50 },
      lateFeePaid: { neg: () => -0 },
    };

    prisma.$transaction = jest.fn(async (fn) => {
      const tx = makeTx();
      tx.rollbackRecord.findFirst.mockResolvedValue(null);
      tx.auditLog.findMany.mockResolvedValue([{ operation: 'repayment' }]);

      tx.payment.findFirst.mockResolvedValue(fakePayment);
      tx.payment.update.mockResolvedValue({ ...fakePayment, status: 'ROLLED_BACK' });
      tx.payment.create.mockResolvedValue({ id: 'rev-pay' });

      // repayment schedules that were marked paid
      tx.repaymentSchedule.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
      ]);
      tx.repaymentSchedule.update.mockResolvedValue({});

      tx.rollbackRecord.create.mockResolvedValue({
        transactionId: 'txn-r',
        originalOperation: 'repayment',
        rollbackReason: 'reason',
        compensatingActions: [
          { type: 'reverse_payment', detail: { reversePaymentId: 'rev-pay' } },
          { type: 'revert_schedule', detail: { scheduleId: 's1' } },
          { type: 'revert_schedule', detail: { scheduleId: 's2' } },
        ],
        rolledBackBy: 'system',
        createdAt: new Date(),
      });

      return fn(tx);
    });

    const res = await service.rollbackTransaction('txn-r', 'reason');

    expect(res.transactionId).toBe('txn-r');
    expect(res.compensatingActions.some(a => a.type === 'reverse_payment')).toBe(true);
    expect(res.compensatingActions.filter(a => a.type === 'revert_schedule').length).toBe(2);
  });

  // -------------------------
  // compensateDisbursementByLoan
  // -------------------------
  it('compensateDisbursementByLoan deletes schedules and reverts loan status', async () => {
    const tx = makeTx();
    tx.repaymentSchedule.deleteMany.mockResolvedValue({ count: 3 });
    tx.loan.update.mockResolvedValue({ id: 'L9', status: 'APPROVED' });

    const actions = await service.compensateDisbursementByLoan(tx as any, 'L9');

    expect(tx.repaymentSchedule.deleteMany).toHaveBeenCalledWith({ where: { loanId: 'L9' } });
    expect(tx.loan.update).toHaveBeenCalledWith({
      where: { id: 'L9' },
      data: { status: expect.any(String) },
    });

    expect(actions.some(a => a.type === 'delete_schedules')).toBe(true);
    expect(actions.some(a => a.type === 'loan_status')).toBe(true);
  });

  // -------------------------
  // canRollbackDisbursementByLoan
  // -------------------------
  it('canRollbackDisbursementByLoan returns true when disbursement exists and not rolled back', async () => {
    const tx = makeTx();
    tx.disbursement.findFirst.mockResolvedValue({ id: 'd1', rolledBackAt: null });
    const ok = await service.canRollbackDisbursementByLoan(tx as any, 'L1');
    expect(ok).toBe(true);
  });

  it('canRollbackDisbursementByLoan returns false when no disbursement or already rolled back', async () => {
    const tx = makeTx();
    tx.disbursement.findFirst.mockResolvedValue(null);
    expect(await service.canRollbackDisbursementByLoan(tx as any, 'L1')).toBe(false);

    tx.disbursement.findFirst.mockResolvedValue({ id: 'd2', rolledBackAt: new Date() });
    expect(await service.canRollbackDisbursementByLoan(tx as any, 'L1')).toBe(false);
  });

  // -------------------------
  // markDisbursementRolledBackByLoan
  // -------------------------
  it('markDisbursementRolledBackByLoan updates the disbursement record', async () => {
    const tx = makeTx();
    tx.disbursement.update.mockResolvedValue({ id: 'd1', status: 'ROLLED_BACK' });

    await service.markDisbursementRolledBackByLoan(tx as any, 'L1');

    expect(tx.disbursement.update).toHaveBeenCalledWith({
      where: { loanId: 'L1' },
      data: { status: 'ROLLED_BACK', rolledBackAt: expect.any(Date) },
    });
  });

  // -------------------------
  // getAuditTrail
  // -------------------------
  it('getAuditTrail returns audit logs and rollback records', async () => {
    prisma.auditLog.findMany = jest.fn().mockResolvedValue([{ id: 'a1' }]);
    prisma.rollbackRecord.findMany = jest.fn().mockResolvedValue([{ id: 'rb1' }]);

    const out = await service.getAuditTrail('txnX');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { transactionId: 'txnX' },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.rollbackRecord.findMany).toHaveBeenCalledWith({
      where: { transactionId: 'txnX' },
      orderBy: { createdAt: 'asc' },
    });

    expect(out.auditLogs).toEqual([{ id: 'a1' }]);
    expect(out.rollbackRecords).toEqual([{ id: 'rb1' }]);
  });
});
