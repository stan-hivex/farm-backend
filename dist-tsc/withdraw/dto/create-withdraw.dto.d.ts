export declare class CreateWithdrawDto {
    amount: number;
    method: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CRYPTO';
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    phoneNumber?: string;
    cryptoAddress?: string;
    walletAddress?: string;
    walletaddress?: string;
    wallet_address?: string;
    cryptoAsset?: string;
    token?: string;
    network?: string;
    providerCode?: string;
    provider_network?: string;
    provider?: string;
    pin?: string;
    biometric_auth?: boolean;
    device_fingerprint?: string;
}
