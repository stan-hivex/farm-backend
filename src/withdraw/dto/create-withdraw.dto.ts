import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWithdrawDto {
  @IsNumber()
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
  address?: string;

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
  pin?: string; // Transaction PIN (optional when biometric_auth is used)

  @IsOptional()
  biometric_auth?: boolean;

  @IsOptional()
  @IsString()
  device_fingerprint?: string;
}