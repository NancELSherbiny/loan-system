import { Injectable, Logger } from '@nestjs/common';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type StructuredLogService = 'disbursement' | 'repayment';

export interface StructuredLogPayload {
  timestamp?: string;
  level: StructuredLogLevel;
  service: StructuredLogService;
  operation: string;
  transactionId: string;
  userId?: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

@Injectable()
export class StructuredLoggerService {
  private readonly logger = new Logger(StructuredLoggerService.name);

  log(payload: StructuredLogPayload) {
    const entry = {
      timestamp: payload.timestamp ?? new Date().toISOString(),
      level: payload.level,
      service: payload.service,
      operation: payload.operation,
      transactionId: payload.transactionId,
      userId: payload.userId ?? 'system',
      duration: payload.duration,
      metadata: payload.metadata ?? {},
      error: payload.error,
    };

    const serialized = JSON.stringify(entry);
    switch (payload.level) {
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
}

