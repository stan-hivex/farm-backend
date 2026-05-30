import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+254700123456', description: 'Phone, email, or username' })
  @IsNotEmpty() @IsString() identifier!: string;
  @ApiProperty() @IsNotEmpty() @IsString() password!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() device_name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() device_os?: string;
}