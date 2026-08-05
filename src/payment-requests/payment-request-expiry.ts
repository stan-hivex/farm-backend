// Payment request expiry: change from 5 minutes to 12 hours (720 minutes)
export const PAYMENT_REQUEST_EXPIRY_MINUTES = 12 * 60; // 720 minutes = 12 hours
export const PAYMENT_REQUEST_EXPIRY_MS = PAYMENT_REQUEST_EXPIRY_MINUTES * 60 * 1000;
