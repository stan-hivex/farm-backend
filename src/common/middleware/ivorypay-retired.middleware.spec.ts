import {
  isIvorypayRetiredPath,
  IvorypayRetiredMiddleware,
} from './ivorypay-retired.middleware';

describe('IvorypayRetiredMiddleware', () => {
  it.each([
    '/api/v1/webhook/ivorypay',
    '/api/v1/webhooks/ivorypay',
    '/api/webhooks/ivorypay',
    '/api/v1/ivorypay/webhook',
    '/api/ivorypay/webhook',
    '/api/v1/payments/webhooks/ivorypay',
    '/api/v1/payments/webhooks/ivorypay/trigger-fix',
    '/api/v1/crypto/deposit',
    '/api/v1/crypto/status/abc?x=1',
    '/api/v1/crypto',
  ])('blocks %s', (p) => expect(isIvorypayRetiredPath(p)).toBe(true));

  it.each([
    '/api/v1/wallet/deposit/crypto',
    '/api/v1/withdraw/crypto',
    '/api/v1/webhooks/nowpayments',
    '/api/v1/admin/withdrawals/legacy/stuck',
    '/api/v1/cryptocurrencies',
    '/api/v1/deposit/crypto/estimate',
  ])('allows %s', (p) => expect(isIvorypayRetiredPath(p)).toBe(false));

  function run(flag: string | undefined, url: string) {
    const mw = new IvorypayRetiredMiddleware({
      get: () => flag,
    } as never);
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };
    const next = jest.fn();
    mw.use({ originalUrl: url } as never, res as never, next);
    return { res, next, json };
  }

  it('returns 410 by default', () => {
    const { res, next } = run(undefined, '/api/v1/webhooks/ivorypay');
    expect(res.status).toHaveBeenCalledWith(410);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when IVORYPAY_RETIRED=false', () => {
    const { res, next } = run('false', '/api/v1/webhooks/ivorypay');
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
