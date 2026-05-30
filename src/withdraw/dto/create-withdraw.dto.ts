export class CreateWithdrawDto {
  amount: number;
  method: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CRYPTO';
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  phoneNumber?: string;
  cryptoAddress?: string;
  network?: string;
  pin: string; // Transaction PIN required for security
}