/**
 * Disbursement status constants
 * Prevents typos and ensures consistency across the application
 */
export const DisbursementStatus = {
  COMPLETED: 'COMPLETED',
  ROLLED_BACK: 'ROLLED_BACK',
  PENDING: 'PENDING',
} as const;

export type DisbursementStatusType = typeof DisbursementStatus[keyof typeof DisbursementStatus];

/**
 * Loan status constants
 */
export const LoanStatus = {
  APPROVED: 'APPROVED',
  DISBURSED: 'DISBURSED',
  ROLLED_BACK: 'ROLLED_BACK',
  PENDING: 'PENDING',
} as const;

export type LoanStatusType = typeof LoanStatus[keyof typeof LoanStatus];

/**
 * Repayment schedule status constants
 */
export const RepaymentScheduleStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
} as const;

export type RepaymentScheduleStatusType = typeof RepaymentScheduleStatus[keyof typeof RepaymentScheduleStatus];

