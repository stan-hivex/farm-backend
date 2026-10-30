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
  IsNumber,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PinDto } from '../business-ops/business-ops.dto';
import { Type } from 'class-transformer';
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

/**
 * API payouts carry no PIN: the live key with payouts:write is the credential.
 * Live payouts run through the same automatic withdrawal pipeline as the app.
 */
export class ApiPayoutDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  amount!: number;
  @IsIn(['BANK_TRANSFER', 'MOBILE_MONEY', 'CRYPTO'])
  method!: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CRYPTO';
  @IsOptional() @IsString() @MaxLength(255) account_name?: string;
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[0-9A-Za-z-]{4,64}$/, { message: 'account_number is invalid' }) account_number?: string;
  @IsOptional() @IsString() @MaxLength(120) bank_name?: string;
  @IsOptional()
  @Matches(/^(\+?254|0)(7|1)\d{8}$/, { message: 'phone_number must be a valid Kenyan mobile number' })
  phone_number?: string;
  @IsOptional() @IsString() @MaxLength(20) crypto_currency?: string;
  @IsOptional() @IsString() @MaxLength(255) crypto_address?: string;
  @IsOptional() @IsString() @MaxLength(40) network?: string;
  @IsOptional() @IsString() @MaxLength(128) extra_id?: string;
}
