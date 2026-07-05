import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
  @ApiProperty({ required: false, description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  cf_turnstile_response?: string;
  @ApiProperty({ required: false, description: 'Alternate Turnstile token field' })
  @IsOptional()
  @IsString()
  turnstile_token?: string;
}
