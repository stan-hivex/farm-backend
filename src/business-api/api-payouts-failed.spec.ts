import { ApiPayoutsService } from './api-payouts.service';

describe('ApiPayoutsService failed payout record', () => {
  it('keeps amount and method on a failed payout so the list can show them', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      businesses: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'approved',
          merchant_id: 'm',
          merchant: { status: 'approved' },
        }),
      },
      business_api_payouts: {
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        update,
      },
    };
    const withdraw: any = {
      createWithdrawal: jest
        .fn()
        .mockRejectedValue(new Error('Minimum withdrawal amount')),
    };
    const svc = new ApiPayoutsService(prisma, withdraw, {
      emit: jest.fn(),
    } as any);
    await expect(
      svc.create(
        { businessId: 'b', ownerUserId: 'u', actorUserId: 'u' },
        { amount: 100, method: 'BANK_TRANSFER' } as any,
        'idem-key-123',
      ),
    ).rejects.toThrow('Minimum withdrawal amount');
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe('failed');
    expect(data.response.data).toMatchObject({
      amount: 100,
      method: 'BANK_TRANSFER',
    });
  });
});
