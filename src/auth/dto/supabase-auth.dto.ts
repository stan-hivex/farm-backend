import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SupabaseAuthDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsNotEmpty()
  @IsString()
  supabase_token!: string;
  @ApiProperty({ required: false, description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  cf_turnstile_response?: string;
  @ApiProperty({ required: false, description: 'Alternate Turnstile token field' })
  @IsOptional()
  @IsString()
  turnstile_token?: string;
}
