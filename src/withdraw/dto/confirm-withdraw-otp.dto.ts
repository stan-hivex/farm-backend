import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmWithdrawOtpDto {
  @IsString()
  @IsNotEmpty()
  reference!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}
