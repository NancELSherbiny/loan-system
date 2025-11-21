import { Injectable } from '@nestjs/common';

export interface PaymentAllocation {
  interestPaid: number;
  lateFeePaid: number;
  principalPaid: number;
}

@Injectable()
export class RepaymentCalculationService {
  private readonly baseLateFee = 25;
  private readonly escalatedLateFee = 50;

  calculateDailyInterest(
    principal: number,
    annualRate: number,
    days: number,
    isLeapYear = false,
  ): number {
    if (principal <= 0 || days <= 0) return 0;
    if (annualRate < 0) throw new Error('Annual rate cannot be negative');

    const divisor = isLeapYear ? 366 : 365;
    const dailyRate = annualRate / 100 / divisor;
    return this.round2(principal * dailyRate * days);
  }

  /**
   * Calculate interest day-by-day, accounting for principal reductions from payments.
   * This ensures interest accrues daily based on the outstanding principal at the start of each day.
   */
  calculateDailyInterestWithPrincipalReductions(
    startPrincipal: number,
    annualRate: number,
    startDate: Date,
    endDate: Date,
    payments: Array<{ paymentDate: Date; principalPaid: number }>,
    isLeapYear = false,
  ): number {
    if (startPrincipal <= 0) return 0;
    if (annualRate < 0) throw new Error('Annual rate cannot be negative');

    const divisor = isLeapYear ? 366 : 365;
    const dailyRate = annualRate / 100 / divisor;

    // Sort payments by date
    const sortedPayments = [...payments].sort(
      (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime(),
    );

    let currentPrincipal = startPrincipal;
    let totalInterest = 0;
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(0, 0, 0, 0);

    let paymentIndex = 0;

    // Calculate interest day by day
    while (currentDate <= endDateNormalized) {
      // Calculate interest for this day based on principal at start of day
      const dailyInterest = this.round2(currentPrincipal * dailyRate);
      totalInterest += dailyInterest;

      // Apply all payments made on this day (there could be multiple)
      while (
        paymentIndex < sortedPayments.length &&
        this.isSameDay(sortedPayments[paymentIndex].paymentDate, currentDate)
      ) {
        // Apply principal reduction from payment
        currentPrincipal = Math.max(
          0,
          currentPrincipal - sortedPayments[paymentIndex].principalPaid,
        );
        paymentIndex++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return this.round2(totalInterest);
  }

  calculateLateFee(daysLate: number, gracePeriod = 3): number {
    const effectiveDaysLate = Math.max(0, daysLate - gracePeriod);
    if (effectiveDaysLate === 0) return 0;
    if (effectiveDaysLate >= 30) return this.escalatedLateFee;
    return this.baseLateFee;
  }

  allocatePayment(
    paymentAmount: number,
    interestDue: number,
    lateFeeDue: number,
    outstandingPrincipal: number,
  ): PaymentAllocation {
    let remaining = paymentAmount;
    const interestPaid = Math.min(interestDue, remaining);
    remaining -= interestPaid;

    const lateFeePaid = Math.min(lateFeeDue, remaining);
    remaining -= lateFeePaid;

    const principalPaid = Math.min(outstandingPrincipal, remaining);

    return {
      interestPaid: this.round2(interestPaid),
      lateFeePaid: this.round2(lateFeePaid),
      principalPaid: this.round2(principalPaid),
    };
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1);
    d1.setHours(0, 0, 0, 0);
    const d2 = new Date(date2);
    d2.setHours(0, 0, 0, 0);
    return d1.getTime() === d2.getTime();
  }
}

