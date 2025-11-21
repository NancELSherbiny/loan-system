// src/modules/disbursements/disbursements.controller.ts
import { Controller, Post, Get, Param, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DisbursementService } from './disbursements.service';
import { CreateDisbursementDto } from './dto/create-disbursement.dto';
import { RollbackDisbursementDto } from './dto/rollback-disbursement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';

@ApiTags('disbursements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor)
@Controller('api/disbursements')
export class DisbursementsController {
  constructor(private readonly service: DisbursementService) {}

  @Post()
  async create(@Body() dto: CreateDisbursementDto) {
    return this.service.disburseLoan(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.getDisbursement(id);
  }

  @Post(':id/rollback')
  async rollback(@Param('id') id: string, @Body() dto: RollbackDisbursementDto) {
    return this.service.rollbackDisbursement(id, dto.reason);
  }
}
