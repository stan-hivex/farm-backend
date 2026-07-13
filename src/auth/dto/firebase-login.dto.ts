import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FirebaseLoginDto {
  @ApiPropertyOptional({ description: 'Phone number or identifier linked to the account' })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiProperty({ description: 'Firebase ID token returned after phone verification' })
  @IsNotEmpty()
  @IsString()
  firebase_token!: string;

  @ApiPropertyOptional({ description: 'Country code such as +254 or 254' })
  @IsOptional()
  @IsString()
  country_code?: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  cf_turnstile_response?: string;

  @ApiPropertyOptional({ description: 'Alternate Turnstile token field' })
  @IsOptional()
  @IsString()
  turnstile_token?: string;
}
