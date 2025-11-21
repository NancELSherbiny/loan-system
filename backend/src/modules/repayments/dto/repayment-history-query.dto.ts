import { IsDateString, IsOptional } from 'class-validator';

export class RepaymentHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

