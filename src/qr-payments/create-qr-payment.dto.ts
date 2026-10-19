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
}
