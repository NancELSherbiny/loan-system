import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditContext } from './interfaces/audit-context.interface';



@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs a transaction with:
   * - automatic audit logging
   * - optional idempotency
   * - optional rollback flow
   */
  async run<T>(
    transactionId: string,
    operation: string,
    userId: string,
    metadata: any,
    executor: (tx: Prisma.TransactionClient) => Promise<T>,
    context?: AuditContext,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      if (context?.idempotency) {
        const exists = await context.idempotency.check(tx);
        if (exists) {
          context.idempotency.onDuplicate();
        }
      }

      // 2. Log START
      await tx.auditLog.create({
        data: {
          transactionId,
          operation: `${operation}_START`,
          userId,
          metadata,
        },
      });

      try {
        // 3. Execute business logic
        const result = await executor(tx);

        // 4. Log SUCCESS
        await tx.auditLog.create({
          data: {
            transactionId,
            operation: `${operation}_SUCCESS`,
            userId,
            metadata,
          },
        });

        return result;
      } catch (error) {
        this.logger.error(
          `Transaction failed: ${operation} – ${transactionId}`,
          error.stack,
        );

        // 5. Rollback support
        if (context?.rollback) {
          const allowed = await context.rollback.canRollback(tx);
          if (allowed) {
            const compensateResult = await context.rollback.compensate(tx);
            await context.rollback.markRolledBack(tx);

            await tx.auditLog.create({
              data: {
                transactionId,
                operation: `${operation}_ROLLBACK`,
                userId,
                metadata: {
                  ...metadata,
                  compensateResult,
                  reason: error.message,
                },
              },
            });
          }
        }

        // 6. Log FAILURE
        await tx.auditLog.create({
          data: {
            transactionId,
            operation: `${operation}_FAILED`,
            userId,
            metadata: {
              ...metadata,
              error: error.message,
            },
          },
        });

        throw error;
      }
    });
  }

  /**
   * Returns the audit trail for a transaction.
   */
  async getAuditTrail(transactionId: string) {
    return this.prisma.auditLog.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
