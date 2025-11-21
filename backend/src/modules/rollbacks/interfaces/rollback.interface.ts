// src/transactions/interfaces/rollback.interface.ts

export type OriginalOperation = "disbursement" | "repayment";

export interface Action {
  type: string;
  detail: any;
  timestamp: Date | string;
}

export interface RollbackRecord {
  transactionId: string;
  originalOperation: OriginalOperation;
  rollbackReason: string;
  rollbackTimestamp: Date;
  compensatingActions: Action[];
  rolledBackBy: string;
}

export interface IRollbackService {
  canRollback(transactionId: string): Promise<boolean>;

  rollbackTransaction(
    transactionId: string,
    reason: string
  ): Promise<RollbackRecord>;

  getAuditTrail(
    transactionId: string
  ): Promise<{
    auditLogs: any[];
    rollbackRecords: any[];
  }>;
}
