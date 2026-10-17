import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class TransferWithdrawDto {
  @IsNumber()
  amount!: number;

  @IsString()
  phoneNumber!: string; // Recipient phone for mobile money transfer

  @IsString()
  pin!: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsIn(['MPESA'])
  mobileMoneyProvider!: 'MPESA';
}
