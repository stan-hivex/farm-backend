import axios from 'axios';
import { PaystackService } from './paystack.service';

describe('PaystackService payout destinations', () => {
  let service: PaystackService;

  beforeEach(() => {
    service = new PaystackService({
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? 'test-secret' : undefined,
      ),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['bank', undefined],
    ['mobile money', 'mobile_money'],
  ])('requests Kenyan %s using the KES currency', async (_, type) => {
    const destinations = [{ name: 'Example', code: 'EXAMPLE', active: true }];
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { status: true, data: destinations },
    } as any);

    await expect(service.getBanks('KES', type)).resolves.toEqual(destinations);

    expect(get).toHaveBeenCalledWith(
      'https://api.paystack.co/bank',
      expect.objectContaining({
        params: {
          currency: 'KES',
          ...(type ? { type } : {}),
        },
      }),
    );
  });
});
