// src/common/logging/audit-context.service.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export type StructuredLogService = 'disbursement' | 'repayment';

export interface AuditContext {
  transactionId: string;
  operation: string;
  service: StructuredLogService;
  userId?: string;
}

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditContext>();

  run<T>(context: AuditContext, callback: () => Promise<T> | T): Promise<T> | T {
    return this.storage.run(context, callback);
  }

  getContext(): AuditContext | undefined {
    return this.storage.getStore();
  }
}
