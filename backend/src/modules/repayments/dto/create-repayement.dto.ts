import { IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateRepaymentDto {
  @IsString()
  loanId: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  paymentDate: string;
}