import { IsNumber, IsString, Min } from 'class-validator';

export class CryptoWithdrawalQuoteDto {
  @IsNumber()
  @Min(10)
  amount!: number;

  @IsString()
  cryptoAsset!: string;

  @IsString()
  network!: string;

  @IsString()
  cryptoAddress!: string;
}
