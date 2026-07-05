import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiPropertyOptional({ example: 'secure-reset-token' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{12,}$/, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol',
  })
  password!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  confirm_password!: string;
}
