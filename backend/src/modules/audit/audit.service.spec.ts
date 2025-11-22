import { AuditService } from './audit.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;

  let tx: any;

  beforeEach(() => {
    tx = {
      auditLog: {
        create: jest.fn().mockResolvedValue(true),
      },
    };

    prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    service = new AuditService(prisma);
  });

  // -----------------------------------------------------
  // SUCCESSFUL TRANSACTION
  // -----------------------------------------------------
  it('should run a successful transaction and log START and SUCCESS', async () => {
    const mockExecutor = jest.fn().mockResolvedValue('OK');

    const result = await service.run(
      'txn123',
      'DISBURSE',
      'userA',
      { amount: 100 },
      mockExecutor,
    );

    expect(result).toBe('OK');

    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);

    expect(tx.auditLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        transactionId: 'txn123',
        operation: 'DISBURSE_START',
        userId: 'userA',
        metadata: { amount: 100 },
      },
    });

    expect(tx.auditLog.create).toHaveBeenNthCalledWith(2, {
      data: {
        transactionId: 'txn123',
        operation: 'DISBURSE_SUCCESS',
        userId: 'userA',
        metadata: { amount: 100 },
      },
    });

    expect(mockExecutor).toHaveBeenCalledWith(tx);
  });

  // -----------------------------------------------------
  // IDEMPOTENCY
  // -----------------------------------------------------
  it('should trigger idempotency.onDuplicate when check() returns true', async () => {
    const onDuplicate = jest.fn();

    const context = {
      idempotency: {
        check: jest.fn().mockResolvedValue(true),
        onDuplicate,
      },
    };

    await service.run(
      'txn123',
      'PAYMENT',
      'userA',
      {},
      jest.fn().mockResolvedValue('ignored'),
      context as any,
    );

    expect(context.idempotency.check).toHaveBeenCalled();
    expect(onDuplicate).toHaveBeenCalled();
  });

  // -----------------------------------------------------
  // FAILURE + FAILURE LOGGING
  // -----------------------------------------------------
  it('should log FAILURE and rethrow error when executor fails', async () => {
    const mockExecutor = jest.fn().mockRejectedValue(new Error('Boom'));

    await expect(
      service.run('txn1', 'OP', 'userX', {}, mockExecutor),
    ).rejects.toThrow('Boom');

    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);

    expect(tx.auditLog.create).toHaveBeenNthCalledWith(2, {
      data: {
        transactionId: 'txn1',
        operation: 'OP_FAILED',
        userId: 'userX',
        metadata: { error: 'Boom' },
      },
    });
  });

  // -----------------------------------------------------
  // FAILURE + ROLLBACK FLOW
  // -----------------------------------------------------
  it('should perform rollback when executor throws and rollback.canRollback returns true', async () => {
    const mockExecutor = jest.fn().mockRejectedValue(new Error('Fail'));

    const context = {
      rollback: {
        canRollback: jest.fn().mockResolvedValue(true),
        compensate: jest.fn().mockResolvedValue('compensated'),
        markRolledBack: jest.fn().mockResolvedValue(true),
      },
    };

    await expect(
      service.run('txn1', 'ROLL', 'userY', { foo: 1 }, mockExecutor, context as any),
    ).rejects.toThrow('Fail');

    expect(context.rollback.canRollback).toHaveBeenCalledWith(tx);
    expect(context.rollback.compensate).toHaveBeenCalledWith(tx);
    expect(context.rollback.markRolledBack).toHaveBeenCalledWith(tx);

    expect(tx.auditLog.create).toHaveBeenNthCalledWith(
  2,
  expect.objectContaining({
    data: expect.objectContaining({
      operation: 'ROLL_ROLLBACK',
    }),
  })
);

expect(tx.auditLog.create).toHaveBeenNthCalledWith(
  3,
  expect.objectContaining({
    data: expect.objectContaining({
      operation: 'ROLL_FAILED',
    }),
  })
);

  });

  // -----------------------------------------------------
  // GET AUDIT TRAIL
  // -----------------------------------------------------
  it('should fetch audit trail', async () => {
    prisma.auditLog.findMany = jest.fn().mockResolvedValue([
      { id: 1, op: 'START' },
    ]);

    const result = await service.getAuditTrail('txn123');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { transactionId: 'txn123' },
      orderBy: { createdAt: 'asc' },
    });

    expect(result).toEqual([{ id: 1, op: 'START' }]);
  });
});
