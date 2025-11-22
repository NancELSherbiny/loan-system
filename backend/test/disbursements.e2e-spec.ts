import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Disbursements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;

  const basePayload = {
    loanId: 'loan-123',
    borrowerId: 'borrower-456',
    amount: 10000,
    currency: 'USD',
    disbursementDate: '2025-11-01T00:00:00.000Z',
    firstPaymentDate: '2025-12-01T00:00:00.000Z',
    tenor: 12,
    interestRate: 12,
  };

  const createApprovedLoan = async (overrides: Partial<typeof basePayload> = {}) => {
    const loanId = overrides.loanId ?? basePayload.loanId;
    const borrowerId = overrides.borrowerId ?? basePayload.borrowerId;
    const amount = overrides.amount ?? basePayload.amount;
    const interestRate = overrides.interestRate ?? basePayload.interestRate;

    return prisma.loan.create({
      data: {
        id: loanId,
        borrowerId,
        amount: new Prisma.Decimal(amount),
        interestRate: new Prisma.Decimal(interestRate),
        tenor: overrides.tenor ?? basePayload.tenor,
        status: 'APPROVED',
      },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = await jwtService.signAsync({
      sub: 'e2e-tester',
      roles: ['disbursement:write'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rollbackRecord.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.repaymentSchedule.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.disbursement.deleteMany();
    await prisma.loan.deleteMany();

    // Seed platform funds so ensurePlatformHasFunds passes
    await prisma.loan.create({
      data: {
        id: 'platform-fund-loan',
        borrowerId: 'platform',
        amount: new Prisma.Decimal(1),
        interestRate: new Prisma.Decimal(1),
        tenor: 1,
        status: 'SETTLED',
      },
    });
    await prisma.payment.create({
      data: {
        loanId: 'platform-fund-loan',
        amount: new Prisma.Decimal(1_000_000),
        paymentDate: new Date(),
        principalPaid: new Prisma.Decimal(1_000_000),
        interestPaid: new Prisma.Decimal(0),
        lateFeePaid: new Prisma.Decimal(0),
        daysLate: 0,
        status: 'COMPLETED',
      },
    });
  });

  describe('POST /api/disbursements', () => {
    it('creates a new disbursement for an approved loan', async () => {
      await createApprovedLoan();

      const response = await request(app.getHttpServer())
        .post('/api/disbursements')
        .set('Authorization', `Bearer ${authToken}`)
        .send(basePayload)
        .expect(201);

      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.loanId).toBe(basePayload.loanId);
    });

    it('rejects duplicate disbursements for the same loan', async () => {
      const loanId = 'loan-dup';
      await createApprovedLoan({ loanId });
      const payload = { ...basePayload, loanId };

      await request(app.getHttpServer())
        .post('/api/disbursements')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/disbursements')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(409);
    });

    it('does not crash on malicious input', async () => {
      await createApprovedLoan({ loanId: 'loan-sql', borrowerId: 'safe-user' });

      const response = await request(app.getHttpServer())
        .post('/api/disbursements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          loanId: 'loan-sql',
          borrowerId: "'; DROP TABLE loans; --",
          amount: 10000,
          currency: 'USD',
          disbursementDate: '2025-11-01T00:00:00.000Z',
          firstPaymentDate: '2025-12-01T00:00:00.000Z',
          tenor: 12,
          interestRate: 12,
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });
});

