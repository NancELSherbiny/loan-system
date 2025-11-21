import { IsDateString, IsOptional } from 'class-validator';

export class RepaymentCalculationQueryDto {
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

