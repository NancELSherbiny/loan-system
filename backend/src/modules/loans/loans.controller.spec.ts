import { Test, TestingModule } from '@nestjs/testing';
import { LoansController } from './loans.controller';
import { LoanService } from './loans.service';

describe('LoansController', () => {
  let controller: LoansController;
  const mockLoanService = {
    getLoan: jest.fn(),
    getAuditTrail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoansController],
      providers: [
        {
          provide: LoanService,
          useValue: mockLoanService,
        },
      ],
    }).compile();

    controller = module.get<LoansController>(LoansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
