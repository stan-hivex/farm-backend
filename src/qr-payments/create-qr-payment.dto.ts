import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateQrPaymentDto {
  @IsString()
  @Length(1, 128)
  merchantId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(['mpesa', 'card', 'bank', 'crypto'])
  method!: 'mpesa' | 'card' | 'bank' | 'crypto';

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  // Accept fields from cached web builds; QR payment initialization ignores them.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  crypto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  chain?: string;
}
