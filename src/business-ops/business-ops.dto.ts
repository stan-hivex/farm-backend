import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BUSINESS_ROLES } from './permissions';

export class PinDto {
  @IsString() @IsNotEmpty() @MaxLength(12) pin!: string;
}

export class AddMemberDto extends PinDto {
  @IsString() @IsNotEmpty() @MaxLength(255) identifier!: string;
  @IsIn(BUSINESS_ROLES.filter((r) => r !== 'owner')) role!: string;
}

export class UpdateMemberDto extends PinDto {
  @IsIn(BUSINESS_ROLES.filter((r) => r !== 'owner')) role!: string;
}

export class CustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class InvoiceItemDto {
  @IsString() @IsNotEmpty() @MaxLength(255) description!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(10000)
  quantity!: number;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  unit_price!: number;
}

export class InvoiceDto {
  @IsOptional() @IsString() customer_id?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PaymentLinkDto {
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount!: number;
  @IsOptional() @IsDateString() expires_at?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  max_uses?: number;
}

export class ToggleLinkDto {
  @IsBoolean() is_active!: boolean;
}

export class PayoutDto extends PinDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000)
  amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) payout_method!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) account_name!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) account_number!: string;
}

export class MilestoneDto {
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class BusinessEscrowDto {
  @IsString() @IsNotEmpty() @MaxLength(255) buyer_identifier!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000)
  amount!: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
  @IsOptional() @IsDateString() expires_at?: string;
}

export class ProfileDto {
  @IsOptional() @IsString() @MaxLength(255) trading_name?: string;
  @IsOptional() @IsEmail() @MaxLength(255) business_email?: string;
  @IsOptional() @IsString() @MaxLength(30) business_phone?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(255)
  website?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() address?: string;
}

export const ANALYTICS_RANGES = ['7d', '30d', '90d', '1y'] as const;
