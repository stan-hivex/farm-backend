export declare const MAX_PIN_ATTEMPTS = 5;
export declare const MAX_LOGIN_ATTEMPTS = 5;
export declare const LOGIN_LOCKOUT_STEP_ATTEMPTS = 5;
export declare const OTP_EXPIRY_MINUTES = 5;
export declare const OTP_MAX_ATTEMPTS = 3;
export declare const ESCROW_AUTO_RELEASE_DAYS = 7;
export declare const DEFAULT_PAGE_SIZE = 20;
export declare const MAX_PAGE_SIZE = 100;
export declare const FARM_CURRENCY = "FARM";
export declare const PLATFORM_FEE_WALLET = "PLATFORM";
export declare const QUEUES: {
    NOTIFICATIONS: string;
    ESCROW: string;
    PAYOUTS: string;
    BLOCKCHAIN: string;
    WEBHOOKS: string;
};
export declare const EVENTS: {
    TX_CREATED: string;
    TX_COMPLETED: string;
    ESCROW_FUNDED: string;
    ESCROW_RELEASED: string;
    ESCROW_DISPUTED: string;
};
