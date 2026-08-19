import { IsNumber, IsString } from 'class-validator';

export class TransferWithdrawDto {
  @IsNumber()
  amount!: number;

  @IsString()
  phoneNumber!: string; // Recipient phone for mobile money transfer

  @IsString()
  pin!: string;

  @IsString()
  accountName?: string;
}
