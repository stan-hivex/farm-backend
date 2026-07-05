import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+254700123456', description: 'Phone, email, or username' })
  @IsNotEmpty() @IsString() identifier!: string;
  @ApiProperty() @IsNotEmpty() @IsString() password!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() device_name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() device_os?: string;
  @ApiProperty({ required: false, description: 'Cloudflare Turnstile token' }) @IsOptional() @IsString() cf_turnstile_response?: string;
  @ApiProperty({ required: false, description: 'Alternate Turnstile token field' }) @IsOptional() @IsString() turnstile_token?: string;
}