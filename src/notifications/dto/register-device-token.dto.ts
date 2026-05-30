import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
