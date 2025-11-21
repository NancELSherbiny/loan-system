import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';
import { AuditContextService } from '../../modules/audit/audit-context.service';

@Global()
@Module({
  providers: [StructuredLoggerService, AuditContextService],
  exports: [StructuredLoggerService, AuditContextService],
})
export class LoggingModule {}

