import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'John' }) @IsNotEmpty() @IsString() first_name!: string;
  @ApiProperty({ example: 'Doe' }) @IsNotEmpty() @IsString() last_name!: string;
  @ApiProperty({ example: 'johndoe' })
  @IsNotEmpty() @Matches(/^[a-z0-9_]+$/, { message: 'username: lowercase letters, numbers, underscores only' }) username!: string;
  @ApiProperty({ example: '+254700123456' })
  @IsNotEmpty() @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Valid E.164 phone required' }) phone!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ minLength: 12 })
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{12,}$/, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol',
  })
  password!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() country?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referral_code?: string;
}