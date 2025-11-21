// ./prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { StructuredLoggerService } from '../src/common/logging/structured-logger.service';
import { AuditContextService } from '../src/modules/audit/audit-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly context: AuditContextService,
  ) {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
      ] as const,
    });

    (this as any).$on('query', (event: Prisma.QueryEvent) => {
      const ctx = this.context.getContext();
      if (!ctx) {
        return;
      }

      this.logger.log({
        level: 'debug',
        service: ctx.service,
        operation: ctx.operation,
        transactionId: ctx.transactionId,
        userId: ctx.userId,
        duration: event.duration,
        metadata: {
          model: event.target,
          query: event.query,
          params: event.params,
        },
      });
    });
  }

  async onModuleInit() {
    await this.$connect(); // connect to DB when app starts
  }

  async onModuleDestroy() {
    await this.$disconnect(); // disconnect gracefully on shutdown
  }
}
