import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty() @IsNotEmpty() @IsString() phone!: string;
  @ApiProperty() @IsNotEmpty() @IsString() @Length(6, 6) otp_code!: string;
  @ApiProperty({ required: false, default: 'phone_verification' }) @IsOptional() @IsString() purpose?: string;
}