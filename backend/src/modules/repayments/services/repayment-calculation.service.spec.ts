import { RepaymentCalculationService } from './repayment-calculation.service';

describe('RepaymentCalculationService', () => {
  let service: RepaymentCalculationService;

  beforeEach(() => {
    service = new RepaymentCalculationService();
  });

  describe('calculateDailyInterest', () => {
    it('should calculate interest correctly for 30 days', () => {
      const principal = 10000;
      const annualRate = 12;
      const days = 30;

      const interest = service.calculateDailyInterest(
        principal,
        annualRate,
        days,
      );

      expect(interest).toBeCloseTo(98.63, 2);
    });

    it('should calculate interest correctly for 35 days (including late days)', () => {
      const principal = 10000;
      const annualRate = 12;
      const days = 35;

      const interest = service.calculateDailyInterest(
        principal,
        annualRate,
        days,
      );

      expect(interest).toBeCloseTo(115.07, 2);
    });

    it('should handle leap year correctly', () => {
      const principal = 10000;
      const annualRate = 12;
      const days = 366;

      const interest = service.calculateDailyInterest(
        principal,
        annualRate,
        days,
        true,
      );

      expect(interest).toBeCloseTo(1200, 2);
    });

    it('should return 0 interest for 0 days', () => {
      const interest = service.calculateDailyInterest(10000, 12, 0);
      expect(interest).toBe(0);
    });

    it('should return 0 for 0 or negative principal', () => {
      expect(service.calculateDailyInterest(0, 12, 30)).toBe(0);
      expect(service.calculateDailyInterest(-10000, 12, 30)).toBe(0);
    });
  });

  describe('calculateDailyInterestWithPrincipalReductions', () => {
    it('should calculate interest day-by-day without payments', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const interest = service.calculateDailyInterestWithPrincipalReductions(
        10000,
        12,
        startDate,
        endDate,
        [],
        false,
      );
      // 30 days of interest on 10000 at 12% annual rate
      expect(interest).toBeCloseTo(98.63, 2);
    });

    it('should account for principal reductions from payments', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const payments = [
        { paymentDate: new Date('2024-01-15'), principalPaid: 2000 },
      ];
      const interest = service.calculateDailyInterestWithPrincipalReductions(
        10000,
        12,
        startDate,
        endDate,
        payments,
        false,
      );
      // 14 days on 10000 + 16 days on 8000
      // (10000 * 0.12/365 * 14) + (8000 * 0.12/365 * 16)
      // = 46.03 + 42.08 = 88.11
      expect(interest).toBeCloseTo(88.11, 2);
    });

    it('should handle multiple payments on different days', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const payments = [
        { paymentDate: new Date('2024-01-10'), principalPaid: 1000 },
        { paymentDate: new Date('2024-01-20'), principalPaid: 2000 },
      ];
      const interest = service.calculateDailyInterestWithPrincipalReductions(
        10000,
        12,
        startDate,
        endDate,
        payments,
        false,
      );
      // 9 days on 10000 + 10 days on 9000 + 11 days on 7000
      expect(interest).toBeCloseTo(88.11, 1);
    });

    it('should handle payments on the same day', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const payments = [
        { paymentDate: new Date('2024-01-15'), principalPaid: 1000 },
        { paymentDate: new Date('2024-01-15'), principalPaid: 1000 },
      ];
      const interest = service.calculateDailyInterestWithPrincipalReductions(
        10000,
        12,
        startDate,
        endDate,
        payments,
        false,
      );
      // 14 days on 10000 + 16 days on 8000 (both payments applied on day 15)
      expect(interest).toBeCloseTo(88.11, 2);
    });

    it('should return 0 for 0 principal', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const interest = service.calculateDailyInterestWithPrincipalReductions(
        0,
        12,
        startDate,
        endDate,
        [],
        false,
      );
      expect(interest).toBe(0);
    });
  });

  describe('calculateLateFee', () => {
    it('should return 0 for payments on time', () => {
      expect(service.calculateLateFee(0)).toBe(0);
    });

    it('should return 0 for 1-3 days late (grace period)', () => {
      expect(service.calculateLateFee(1)).toBe(0);
      expect(service.calculateLateFee(2)).toBe(0);
      expect(service.calculateLateFee(3)).toBe(0);
    });

    it('should apply flat fee after grace period', () => {
      expect(service.calculateLateFee(5)).toBe(25);
    });

    it('should apply increased fee for 30+ days late', () => {
      expect(service.calculateLateFee(30)).toBe(50);
    });
  });

  describe('allocatePayment', () => {
    it('should allocate: interest first, then late fee, then principal', () => {
      const allocation = service.allocatePayment(1000, 115.15, 25, 10000);

      expect(allocation.interestPaid).toBeCloseTo(115.15, 2);
      expect(allocation.lateFeePaid).toBe(25);
      expect(allocation.principalPaid).toBeCloseTo(859.85, 2);
    });

    it('should handle partial payment less than interest', () => {
      const allocation = service.allocatePayment(50, 115.15, 25, 10000);

      expect(allocation.interestPaid).toBe(50);
      expect(allocation.lateFeePaid).toBe(0);
      expect(allocation.principalPaid).toBe(0);
    });
  });
});

