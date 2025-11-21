import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DisbursementsService } from './disbursements.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TransactionService } from '../../common/services/transaction.service';

describe('DisbursementsService', () => {
  let service: DisbursementsService;

  const decimal = (value: number) => ({
    toString: () => value.toString(),
  });

  const createTransactionClient = () => ({
    disbursement: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    repaymentSchedule: {
      createMany: jest.fn(),
    },
    loan: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    rollbackRecord: {
      create: jest.fn(),
    },
  });

  let transactionClient = createTransactionClient();
  const mockPrismaService = {
    $transaction: jest.fn(),
  };
  const mockTransactionService = {
    run: jest.fn(),
  };

  const baseDisbursementDto = {
    loanId: 'loan-123',
    borrowerId: 'borrower-456',
    amount: 10000,
    currency: 'USD',
    tenor: 12,
    interestRate: 12,
    disbursementDate: new Date('2025-01-01'),
    firstPaymentDate: new Date('2025-02-01'),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionClient = createTransactionClient();

    mockPrismaService.$transaction.mockImplementation((callback) =>
      callback(transactionClient),
    );

    mockTransactionService.run.mockImplementation(
      async (
        transactionId,
        operation,
        userId,
        metadata,
        work,
        options,
      ) => {
        if (options?.idempotency) {
          const exists = await options.idempotency.check(transactionClient);
          if (exists) {
            if (options.idempotency.onDuplicate) {
              await options.idempotency.onDuplicate();
            }
            throw new ConflictException('Duplicate transaction');
          }
        }
        return work(transactionClient);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisbursementsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    service = module.get<DisbursementsService>(DisbursementsService);
  });

  const seedSuccessfulTransaction = () => {
    transactionClient.disbursement.findUnique.mockResolvedValue(null);
    transactionClient.loan.findUnique.mockResolvedValue({
      id: baseDisbursementDto.loanId,
      borrowerId: baseDisbursementDto.borrowerId,
      status: 'APPROVED',
    });
    transactionClient.disbursement.create.mockResolvedValue({
      id: 'disb-001',
      status: 'COMPLETED',
      amount: baseDisbursementDto.amount,
    });
    transactionClient.repaymentSchedule.createMany.mockResolvedValue({
      count: baseDisbursementDto.tenor,
    });
    transactionClient.loan.update.mockResolvedValue({});
    transactionClient.auditLog.create.mockResolvedValue({});
    transactionClient.disbursement.aggregate.mockResolvedValue({
      _sum: { amount: decimal(0) },
    });
    transactionClient.payment.aggregate.mockResolvedValue({
      _sum: { amount: decimal(baseDisbursementDto.amount * 10) },
    });
  };

  describe('disburseLoan', () => {
    it('successfully creates disbursement and repayment schedule', async () => {
      seedSuccessfulTransaction();

      const result = await service.disburseLoan(baseDisbursementDto);

      expect(result.status).toBe('COMPLETED');
      expect(mockTransactionService.run).toHaveBeenCalledTimes(1);
      expect(
        transactionClient.repaymentSchedule.createMany,
      ).toHaveBeenCalled();
      expect(transactionClient.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operation: 'DISBURSEMENT',
          }),
        }),
      );
    });

    it('throws ConflictException when loan already disbursed', async () => {
      transactionClient.loan.findUnique.mockResolvedValue({
        id: baseDisbursementDto.loanId,
        borrowerId: baseDisbursementDto.borrowerId,
        status: 'APPROVED',
      });
      transactionClient.disbursement.aggregate.mockResolvedValue({
        _sum: { amount: decimal(0) },
      });
      transactionClient.payment.aggregate.mockResolvedValue({
        _sum: { amount: decimal(baseDisbursementDto.amount * 10) },
      });
      transactionClient.disbursement.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });

      await expect(
        service.disburseLoan(baseDisbursementDto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for invalid amount', async () => {
      transactionClient.loan.findUnique.mockResolvedValue({
        id: baseDisbursementDto.loanId,
        borrowerId: baseDisbursementDto.borrowerId,
        status: 'APPROVED',
      });
      transactionClient.disbursement.findUnique.mockResolvedValue(null);
      transactionClient.disbursement.aggregate.mockResolvedValue({
        _sum: { amount: decimal(0) },
      });
      transactionClient.payment.aggregate.mockResolvedValue({
        _sum: { amount: decimal(baseDisbursementDto.amount * 10) },
      });
      const invalidDto = { ...baseDisbursementDto, amount: -500 };

      await expect(service.disburseLoan(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

