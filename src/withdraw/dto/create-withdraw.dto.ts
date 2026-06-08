import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWithdrawDto {
  @IsNumber()
  @Min(10, { message: 'Minimum withdrawal amount is 10 FARM' })
  amount!: number;

  @IsEnum(['BANK_TRANSFER', 'MOBILE_MONEY', 'CRYPTO'])
  method!: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CRYPTO';

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  cryptoAddress?: string;

  @IsOptional()
  @IsString()
  network?: string;

  @IsString()
  pin!: string; // Transaction PIN required for security
}