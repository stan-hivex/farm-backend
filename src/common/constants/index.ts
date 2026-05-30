export const MAX_PIN_ATTEMPTS = 5;
export const MAX_LOGIN_ATTEMPTS = 5;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 3;
export const ESCROW_AUTO_RELEASE_DAYS = 7;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const FARM_CURRENCY = 'FARM';
export const PLATFORM_FEE_WALLET = 'PLATFORM';
export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  ESCROW: 'escrow',
  PAYOUTS: 'payouts',
  BLOCKCHAIN: 'blockchain',
  WEBHOOKS: 'webhooks',
};
export const EVENTS = {
  TX_CREATED: 'transaction.created',
  TX_COMPLETED: 'transaction.completed',
  ESCROW_FUNDED: 'escrow.funded',
  ESCROW_RELEASED: 'escrow.released',
  ESCROW_DISPUTED: 'escrow.disputed',
};