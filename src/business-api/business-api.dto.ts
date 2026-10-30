import { OmitType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { PayoutDto, PinDto } from '../business-ops/business-ops.dto';
import { API_SCOPES } from './api-scopes';
import { WEBHOOK_EVENTS } from '../business-ops/business-webhooks.service';

export class CreateApiKeyDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsIn(['sandbox', 'live']) mode!: 'sandbox' | 'live';
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(API_SCOPES, { each: true })
  scopes?: string[];
  @IsOptional() @IsDateString() expires_at?: string;
}

export class KeyPinDto extends PinDto {}

export class WebhookEndpointDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  url!: string;
  @IsIn(['sandbox', 'live']) mode!: 'sandbox' | 'live';
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn([...WEBHOOK_EVENTS, '*'], { each: true })
  events!: string[];
}

export class UpdateWebhookDto {
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn([...WEBHOOK_EVENTS, '*'], { each: true })
  events?: string[];
  @IsOptional() @IsBoolean() is_active?: boolean;
}

/** API payouts carry no PIN: the live key with payouts:write is the credential. */
export class ApiPayoutDto extends OmitType(PayoutDto, ['pin'] as const) {}
