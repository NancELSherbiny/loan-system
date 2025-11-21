// src/modules/disbursements/dto/create-disbursement.dto.ts
import { IsString, IsNumber, IsDate, IsDateString, IsPositive } from 'class-validator';

export class CreateDisbursementDto {
  @IsString()
  loanId: string;

  @IsString()
  borrowerId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsDateString()
  disbursementDate: string;

  @IsDateString()
  firstPaymentDate: string;

  @IsNumber()
  tenor: number;

  @IsNumber()
  interestRate: number;
}

