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
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  cryptoAddress?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @IsString()
  walletaddress?: string;

  @IsOptional()
  @IsString()
  wallet_address?: string;

  @IsOptional()
  @IsString()
  cryptoAsset?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  network?: string;

  @IsOptional()
  @IsString()
  providerCode?: string;

  @IsOptional()
  @IsString()
  provider_network?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  pin?: string; // Transaction PIN (optional when biometric_auth is used)

  @IsOptional()
  biometric_auth?: boolean;

  @IsOptional()
  @IsString()
  device_fingerprint?: string;
}