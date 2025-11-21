import { Injectable, Logger } from '@nestjs/common';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type StructuredLogService = 'disbursement' | 'repayment' | 'loan';

export interface StructuredLogPayload {
  timestamp?: string;
  level?: StructuredLogLevel;
  service: StructuredLogService;
  operation: string;
  transactionId: string;
  userId?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

@Injectable()
export class StructuredLoggerService {
  private readonly logger = new Logger(StructuredLoggerService.name);

  private safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (typeof value === 'bigint') return value.toString();
      return value;
    });
  }

  private buildEntry(payload: StructuredLogPayload) {
    return {
      timestamp: payload.timestamp ?? new Date().toISOString(),
      level: payload.level ?? 'info',
      service: payload.service,
      operation: payload.operation,
      transactionId: payload.transactionId,
      userId: payload.userId ?? 'system',
      duration: payload.duration,
      metadata: payload.metadata ?? {},
      error: payload.error,
    };
  }

  log(payload: StructuredLogPayload) {
    const entry = this.buildEntry(payload);
    const serialized = this.safeStringify(entry);
    switch (entry.level) {
      case 'debug':
        this.logger.debug(serialized);
        break;
      case 'info':
        this.logger.log(serialized);
        break;
      case 'warn':
        this.logger.warn(serialized);
        break;
      case 'error':
        this.logger.error(serialized);
        break;
      default:
        this.logger.log(serialized);
    }
  }

  debug(p: Omit<StructuredLogPayload, 'level'>) {
    this.log({ ...p, level: 'debug' });
  }

  info(p: Omit<StructuredLogPayload, 'level'>) {
    this.log({ ...p, level: 'info' });
  }

  warn(p: Omit<StructuredLogPayload, 'level'>) {
    this.log({ ...p, level: 'warn' });
  }

  error(p: Omit<StructuredLogPayload, 'level'>) {
    this.log({ ...p, level: 'error' });
  }
}