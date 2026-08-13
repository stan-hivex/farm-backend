import { AdminController } from './admin.controller';

describe('AdminController', () => {
  it('exposes merchant detail route handler', async () => {
    const svc: any = {
      getMerchant: jest.fn().mockResolvedValue({ data: { id: 'merchant-1' } }),
      getFees: jest.fn().mockResolvedValue({ data: [] }),
    };

    const controller = new AdminController(svc, {} as any);

    await expect(controller.merchant('merchant-1')).resolves.toEqual({ data: { id: 'merchant-1' } });
    expect(svc.getMerchant).toHaveBeenCalledWith('merchant-1');
  });

  it('exposes fees route handler', async () => {
    const svc: any = {
      getFees: jest.fn().mockResolvedValue({ data: [{ id: 'fee-1', value: '1.5' }] }),
      updateFee: jest.fn().mockResolvedValue({ data: { id: 'fee-1' }, message: 'Fee updated' }),
    };

    const controller = new AdminController(svc, {} as any);

    await expect(controller.fees()).resolves.toEqual({ data: [{ id: 'fee-1', value: '1.5' }] });
    await expect(controller.updateFee('fee-1', { value: '2.0' } as any, { id: 'admin-1' } as any)).resolves.toEqual({
      data: { id: 'fee-1' },
      message: 'Fee updated',
    });
    expect(svc.getFees).toHaveBeenCalled();
    expect(svc.updateFee).toHaveBeenCalledWith('fee-1', '2.0', 'admin-1');
  });

  it('exposes currency conversion rate route handlers', async () => {
    const svc: any = {
      getCurrencyRates: jest.fn().mockResolvedValue({ data: [{ usd_kes_rate: 150 }] }),
      updateCurrencyRate: jest.fn().mockResolvedValue({ data: { usd_kes_rate: 155 }, message: 'Currency conversion rate updated' }),
      getCurrentCurrencyRate: jest.fn().mockResolvedValue({ data: { usd_kes_rate: 155, farm_usd_rate: 0.00645 } }),
    };

    const controller = new AdminController(svc, {} as any);

    await expect(controller.getCurrencyRates()).resolves.toEqual({ data: [{ usd_kes_rate: 150 }] });
    await expect(controller.updateCurrencyRate({ usd_kes_rate: 155 } as any, { id: 'admin-1' } as any)).resolves.toEqual({
      data: { usd_kes_rate: 155 },
      message: 'Currency conversion rate updated',
    });
    expect(svc.getCurrencyRates).toHaveBeenCalled();
    expect(svc.updateCurrencyRate).toHaveBeenCalledWith(155, 'admin-1');
  });
});
