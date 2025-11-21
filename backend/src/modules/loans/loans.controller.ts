// src/modules/loans/loans.controller.ts
import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoanService } from './loans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';

@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor)
@Controller('api/loans')
export class LoansController {
  constructor(private readonly service: LoanService,
    
  ) {}

  // GET /api/loans/:id → fetch loan details
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.getLoan(id);
  }

  // GET /api/loans/:id/audit-trail → fetch complete audit trail for loan
  @Get(':id/audit-trail')
  async getAuditTrail(@Param('id') id: string) {
    return this.service.getAuditTrail(id);
  }
}
