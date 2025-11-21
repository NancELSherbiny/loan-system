// src/modules/disbursements/interfaces/loan-disbursement.interface.ts
export interface LoanDisbursement {
  loanId: string;
  borrowerId: string;
  amount: number;
  currency: string;
  disbursementDate: Date;
  firstPaymentDate: Date;
  tenor: number; // months
  interestRate: number; // annual percentage
  status: 'pending' | 'completed' | 'failed' | 'rolled_back';
}
