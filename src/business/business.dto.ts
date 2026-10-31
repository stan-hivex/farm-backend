import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
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

export const BUSINESS_SECTORS = [
  'agriculture',
  'energy',
  'real_estate',
  'infrastructure',
  'technology',
  'manufacturing',
  'retail',
  'services',
  'other',
] as const;

export const BUSINESS_DOCUMENT_TYPES = [
  'certificate_of_incorporation',
  'business_registration',
  'tax_certificate',
  'memorandum_articles',
  'proof_of_address',
  'director_id',
  'beneficial_owner_id',
  'other',
] as const;

/** Documents that must be present before a business can be submitted. */
export const REQUIRED_DOCUMENT_TYPES = [
  'certificate_of_incorporation',
  'proof_of_address',
];

export class BusinessPersonDto {
  @IsIn(['director', 'beneficial_owner']) role!:
    | 'director'
    | 'beneficial_owner';
  @IsNotEmpty() @IsString() @MaxLength(255) full_name!: string;
  @IsOptional() @IsString() @MaxLength(100) nationality?: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsString() @MaxLength(100) id_number?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) ownership_percent?: number;
}

export class BusinessDocumentDto {
  @IsIn(BUSINESS_DOCUMENT_TYPES) doc_type!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) file_url!: string;
  @IsOptional() @IsString() @MaxLength(255) file_name?: string;
}

/** Every field optional: a draft can be saved at any step. */
export class SaveBusinessDraftDto {
  @IsOptional() @IsString() @MaxLength(255) legal_name?: string;
  @IsOptional() @IsString() @MaxLength(255) trading_name?: string;
  @IsOptional() @IsString() @MaxLength(255) registration_number?: string;
  @IsOptional() @IsString() @MaxLength(100) registration_country?: string;
  @IsOptional() @IsDateString() incorporation_date?: string;
  @IsOptional() @IsString() @MaxLength(100) business_type?: string;
  @IsOptional() @IsIn(BUSINESS_SECTORS) sector?: string;
  @IsOptional() @IsString() @MaxLength(100) tax_id?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(30) postal_code?: string;
  @IsOptional() @IsEmail() business_email?: string;
  @IsOptional() @IsString() @MaxLength(30) business_phone?: string;
  @IsOptional() @IsUrl({ require_protocol: false }) website?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  /** When present, replaces the full list of directors and beneficial owners. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BusinessPersonDto)
  persons?: BusinessPersonDto[];

  /** When present, replaces the full list of documents. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BusinessDocumentDto)
  documents?: BusinessDocumentDto[];
}

export class ReviewBusinessDto {
  @IsIn(['approve', 'request_info', 'reject']) decision!:
    | 'approve'
    | 'request_info'
    | 'reject';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
