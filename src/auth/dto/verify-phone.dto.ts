import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyPhoneDto {
  @ApiProperty({ description: 'Firebase ID token returned by the client after phone verification' })
  @IsNotEmpty()
  @IsString()
  firebaseIdToken!: string;

  @ApiProperty({ required: false, description: 'Temporary login token issued after password verification for regular users' })
  @IsOptional()
  @IsString()
  temporaryLoginToken?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cf_turnstile_response?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turnstile_token?: string;
}
