import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AcceptPaymentRequestDto {
  @IsNotEmpty()
  @IsString()
  request_id!: string;

  @IsOptional()
  @IsString()
  @Length(4, 6)
  pin?: string;

  @IsOptional()
  @IsBoolean()
  biometric_auth?: boolean;

  @IsOptional()
  @IsString()
  device_fingerprint?: string;
}
