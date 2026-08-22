import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AcceptPaymentRequestsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  request_ids!: string[];

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