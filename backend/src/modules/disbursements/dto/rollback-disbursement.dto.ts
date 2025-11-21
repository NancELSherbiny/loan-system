// src/modules/disbursements/dto/rollback-disbursement.dto.ts
import { IsString } from 'class-validator';

export class RollbackDisbursementDto {

  @IsString()
  reason: string;
}
