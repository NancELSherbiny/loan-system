import { Test, TestingModule } from '@nestjs/testing';
import { LoanService } from './loans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('LoanService', () => {
  let service: LoanService;
  let prisma: any;

  const mockPrisma = (): jest.Mocked<PrismaService> => ({
    loan: {
      findUnique: jest.fn(),
    },
    disbursement: {
      findUnique: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  } as any);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoanService,
        { provide: PrismaService, useValue: mockPrisma() },
      ],
    }).compile();

    service = module.get(LoanService);
    prisma = module.get(PrismaService);
  });

  // ============================================================
  // getLoan()
  // ============================================================

  it('should return a loan when found', async () => {
    prisma.loan.findUnique.mockResolvedValue({
      id: 'loan123',
      amount: 5000,
    });

    const result = await service.getLoan('loan123');

    expect(prisma.loan.findUnique).toHaveBeenCalledWith({
      where: { id: 'loan123' },
    });
    expect(result).toEqual({ id: 'loan123', amount: 5000 });
  });

  it('should throw NotFoundException when loan does not exist', async () => {
    prisma.loan.findUnique.mockResolvedValue(null);

    await expect(service.getLoan('missing-loan')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ============================================================
  // getAuditTrail()
  // ============================================================

  it('should return audit trail when disbursement and payments exist', async () => {
    prisma.disbursement.findUnique.mockResolvedValue({
      id: 'd1',
      loanId: 'loan123',
    });

    prisma.payment.findMany.mockResolvedValue([
      { id: 'p1', loanId: 'loan123' },
      { id: 'p2', loanId: 'loan123' },
    ]);

    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'a1', transactionId: 'd1' },
      { id: 'a2', transactionId: 'p1' },
      { id: 'a3', transactionId: 'p2' },
    ]);

    const result = await service.getAuditTrail('loan123');

    // correct transactionId list passed to auditLog
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        transactionId: { in: ['d1', 'p1', 'p2'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(result.length).toBe(3);
  });

  it('should handle case with no disbursement but with payments', async () => {
    prisma.disbursement.findUnique.mockResolvedValue(null);

    prisma.payment.findMany.mockResolvedValue([
      { id: 'p1', loanId: 'loan123' },
    ]);

    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'a1', transactionId: 'p1' },
    ]);

    const result = await service.getAuditTrail('loan123');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { transactionId: { in: ['p1'] } },
      orderBy: { createdAt: 'asc' },
    });

    expect(result.length).toBe(1);
  });

  it('should return empty audit trail when there is no disbursement and no payments', async () => {
    prisma.disbursement.findUnique.mockResolvedValue(null);
    prisma.payment.findMany.mockResolvedValue([]);

    prisma.auditLog.findMany.mockResolvedValue([]);

    const result = await service.getAuditTrail('loan123');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { transactionId: { in: [] } },
      orderBy: { createdAt: 'asc' },
    });

    expect(result).toEqual([]);
  });
});
