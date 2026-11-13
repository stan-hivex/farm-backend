import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class AcceptPaymentRequestsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @IsUUID('4', { each: true })
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
