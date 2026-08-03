import { resolveDepositCreditAmount } from './deposit.utils';

describe('resolveDepositCreditAmount', () => {
  it('prefers the deposit amount over the fee-inclusive transaction amount', () => {
    const transaction = {
      amount: 50.75,
      currency: 'KES',
      metadata: { amount_fiat: 50 },
    };

    expect(resolveDepositCreditAmount(transaction, { amount: 50 })).toBe(50);
  });

  it('uses transaction metadata amount_fiat when no deposit record is available', () => {
    const transaction = {
      amount: 50.75,
      currency: 'KES',
      metadata: { amount_fiat: 50 },
    };

    expect(resolveDepositCreditAmount(transaction)).toBe(50);
  });
});
