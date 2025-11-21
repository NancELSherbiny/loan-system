// src/modules/repayments/repayments.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RepaymentsService } from './repayments.service';
import { CreateRepaymentDto } from './dto/create-repayement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { RepaymentHistoryQueryDto } from './dto/repayment-history-query.dto';
import { RepaymentCalculationQueryDto } from './dto/repayment-calculation-query.dto';

@ApiTags('repayments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor)
@Controller('api/repayments')
export class RepaymentsController {
  constructor(private readonly service: RepaymentsService) {}

  @Post()
  async create(@Body() dto: CreateRepaymentDto, @Req() req: Request) {
    const user = req.user as { userId?: string; sub?: string } | undefined;
    const userId = user?.userId ?? user?.sub;
    return this.service.processRepayment(dto, userId);
  }

  @Get(':loanId')
  async history(
    @Param('loanId') loanId: string,
    @Query() query: RepaymentHistoryQueryDto,
  ) {
    return this.service.getRepaymentHistory(loanId, query);
  }

  @Get(':loanId/schedule')
  async schedule(@Param('loanId') loanId: string) {
    return this.service.getRepaymentSchedule(loanId);
  }

  @Get(':loanId/calculate')
  async calculate(
    @Param('loanId') loanId: string,
    @Query() query: RepaymentCalculationQueryDto,
  ) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    return this.service.calculateCurrentDue(loanId, asOf);
  }
}
