import { IsNotEmpty, IsString, Length } from 'class-validator';

export class AcceptPaymentRequestDto {
  @IsNotEmpty()
  @IsString()
  request_id!: string;

  @IsNotEmpty()
  @IsString()
  @Length(4, 6)
  pin!: string;
}
