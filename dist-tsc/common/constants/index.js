"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENTS = exports.QUEUES = exports.PLATFORM_FEE_WALLET = exports.FARM_CURRENCY = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.ESCROW_AUTO_RELEASE_DAYS = exports.OTP_MAX_ATTEMPTS = exports.OTP_EXPIRY_MINUTES = exports.LOGIN_LOCKOUT_STEP_ATTEMPTS = exports.MAX_LOGIN_ATTEMPTS = exports.MAX_PIN_ATTEMPTS = void 0;
exports.MAX_PIN_ATTEMPTS = 5;
exports.MAX_LOGIN_ATTEMPTS = 5;
exports.LOGIN_LOCKOUT_STEP_ATTEMPTS = 5;
exports.OTP_EXPIRY_MINUTES = 5;
exports.OTP_MAX_ATTEMPTS = 3;
exports.ESCROW_AUTO_RELEASE_DAYS = 7;
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
exports.FARM_CURRENCY = 'FARM';
exports.PLATFORM_FEE_WALLET = 'PLATFORM';
exports.QUEUES = {
    NOTIFICATIONS: 'notifications',
    ESCROW: 'escrow',
    PAYOUTS: 'payouts',
    BLOCKCHAIN: 'blockchain',
    WEBHOOKS: 'webhooks',
};
exports.EVENTS = {
    TX_CREATED: 'transaction.created',
    TX_COMPLETED: 'transaction.completed',
    ESCROW_FUNDED: 'escrow.funded',
    ESCROW_RELEASED: 'escrow.released',
    ESCROW_DISPUTED: 'escrow.disputed',
};
//# sourceMappingURL=index.js.map