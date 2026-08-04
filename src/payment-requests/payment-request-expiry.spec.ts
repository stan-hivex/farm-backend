import { PAYMENT_REQUEST_EXPIRY_HOURS, PAYMENT_REQUEST_EXPIRY_MS } from './payment-request-expiry';

describe('payment request expiry', () => {
  it('uses a 12 hour expiry window', () => {
    expect(PAYMENT_REQUEST_EXPIRY_HOURS).toBe(12);
    expect(PAYMENT_REQUEST_EXPIRY_MS).toBe(12 * 60 * 60 * 1000);
  });
});
