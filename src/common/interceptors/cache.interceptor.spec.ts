import { isUncacheablePath } from './cache.interceptor';

describe('isUncacheablePath', () => {
  it('never caches user-mutable state', () => {
    for (const p of [
      '/api/v1/business/status',
      '/api/v1/business/invoices?page=1',
      '/api/v1/merchant/qr',
      '/api/v1/payment-requests/pending',
      '/api/v1/transactions?limit=1',
      '/api/v1/investments/my',
      '/api/v1/wallet',
    ])
      expect(isUncacheablePath(p)).toBe(true);
  });
  it('still caches public catalog reads', () => {
    expect(isUncacheablePath('/api/v1/marketplace/projects')).toBe(false);
    expect(isUncacheablePath('/api/v1/health')).toBe(false);
  });
});
