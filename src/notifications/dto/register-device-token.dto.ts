import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  deviceToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;
}
