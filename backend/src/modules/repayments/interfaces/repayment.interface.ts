import { Loan, RepaymentSchedule } from "@prisma/client";

export interface RepaymentCalculation {
  outstandingPrincipal: number;
  accruedInterest: number;
  lateFee: number;
  totalDue: number;
  daysLate: number;
}

export interface RepaymentDueSummary extends RepaymentCalculation {
  nextDueDate: Date;
  nextInstallmentNumber: number | null;
  scheduledPrincipal: number;
}

export interface LoanSnapshot {
  loan: Loan & { disbursement?: { disbursementDate: Date } | null };
  outstandingPrincipal: number;
  lastPaymentDate: Date;
  nextSchedule?: RepaymentSchedule | null;
  daysSinceLastPayment: number;
  paymentsInPeriod: Array<{ paymentDate: Date; principalPaid: number }>;
  principalAtStartOfPeriod: number;
}