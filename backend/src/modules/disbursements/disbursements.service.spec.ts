import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DisbursementService } from './disbursements.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService} from '../audit/audit.service';
import { StructuredLoggerService } from '../../common/logging/structured-logger.service';
import { RollbackService } from '../rollbacks/rollback.service';


describe('DisbursementsService', () => {
  let service: DisbursementService;

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
  const mockAuditService = {
    run: jest.fn(),
  };

  const baseDisbursementDto = {
    loanId: 'loan-123',
    borrowerId: 'borrower-456',
    amount: 10000,
    currency: 'USD',
    tenor: 12,
    interestRate: 12,
    disbursementDate: new Date('2025-01-01').toISOString(),
    firstPaymentDate: new Date('2025-02-01').toISOString(),
  };

  beforeEach(async () => {
  jest.resetAllMocks();
  transactionClient = createTransactionClient();

  // Make $transaction call the callback with the mocked transaction client
  mockPrismaService.$transaction.mockImplementation((callback) =>
    // support async callback returning a Promise
    Promise.resolve(callback(transactionClient)),
  );

  // Structured logger mock must include .log(...) because service calls structuredLogger.log(...)
  const mockLogger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  // Rollback service mock must provide the methods used in the service (names must match)
  const mockRollbackService = {
    canRollbackDisbursementByLoan: jest.fn().mockResolvedValue(true),
    compensateDisbursementByLoan: jest.fn().mockResolvedValue(undefined),
    markDisbursementRolledBackByLoan: jest.fn().mockResolvedValue(undefined),
    // keep record if other tests use it
    record: jest.fn(),
  };

  // Audit service must execute the 'work' callback and handle idempotency options the service passes.
  mockAuditService.run.mockImplementation(
    async (
      transactionId,
      operation,
      userId,
      metadata,
      work, // the function the service passes to run inside tx
      options,
    ) => {
      // If idempotency option is provided, run the check against the transaction client
      if (options?.idempotency) {
        const exists = await options.idempotency.check(transactionClient);
        if (exists) {
          if (options.idempotency.onDuplicate) {
            await options.idempotency.onDuplicate();
          }
          // The service expects ConflictException to be thrown on duplicate
          throw new ConflictException('Duplicate transaction');
        }
      }
      // If rollback options exist, we don't need to act now — the service passes them to audit wrapper.
      // Execute the work with the mocked tx client and return whatever it returns.
      return work(transactionClient);
    },
  );

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DisbursementService,
      {
        provide: PrismaService,
        useValue: mockPrismaService,
      },
      {
        provide: AuditService,
        useValue: mockAuditService,
      },
      {
        provide: StructuredLoggerService,
        useValue: mockLogger,
      },
      {
        provide: RollbackService,
        useValue: mockRollbackService,
      },
    ],
  }).compile();

  service = module.get<DisbursementService>(DisbursementService);
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
      expect(mockAuditService
    .run).toHaveBeenCalledTimes(1);
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

