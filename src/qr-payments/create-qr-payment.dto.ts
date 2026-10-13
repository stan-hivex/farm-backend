import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
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

  @IsOptional()
  @IsString()
  @Length(8, 20)
  guestPhone?: string;

  @IsOptional()
  @IsIn(['USDC', 'USDT'])
  crypto?: 'USDC' | 'USDT';

  @IsOptional()
  @IsString()
  @Length(2, 32)
  chain?: string;
}
