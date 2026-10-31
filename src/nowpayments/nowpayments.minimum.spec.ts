import { NowpaymentsService } from './nowpayments.service';

describe('NowpaymentsService payment minimum', () => {
  it('uses the same-currency USD-equivalent minimum query as the status page', async () => {
    const service = new NowpaymentsService({} as any);
    const request = jest.spyOn(service as any, 'request').mockResolvedValue({
      min_amount: '0.0006299',
      fiat_equivalent: '0.05',
    });

    await expect(service.getMinimumPaymentAmount('LTC')).resolves.toEqual({
      currency: 'ltc',
      minimumAmount: 0.0006299,
      minimumUsd: 0.05,
    });

    expect(request).toHaveBeenCalledWith('get', '/min-amount', undefined, {
      currency_from: 'ltc',
      currency_to: 'ltc',
      fiat_equivalent: 'usd',
    });
  });
});
