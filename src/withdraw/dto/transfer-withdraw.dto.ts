import { IsNumber, IsString, Min } from 'class-validator';

export class TransferWithdrawDto {
  @IsNumber()
  @Min(10, { message: 'Minimum withdrawal amount is 10 FARM' })
  amount!: number;

  @IsString()
  phoneNumber!: string; // Recipient phone for mobile money transfer

  @IsString()
  pin!: string;

  @IsString()
  accountName?: string;
}
