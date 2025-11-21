import { Prisma } from "@prisma/client";

export interface AuditContext {
  idempotency?: {
    check: (tx: Prisma.TransactionClient) => Promise<boolean>;
    onDuplicate: () => void;
  };
  rollback?: {
    canRollback: (tx: Prisma.TransactionClient) => Promise<boolean>;
    compensate: (tx: Prisma.TransactionClient) => Promise<any>;
    markRolledBack: (tx: Prisma.TransactionClient) => Promise<any>;
  };
}