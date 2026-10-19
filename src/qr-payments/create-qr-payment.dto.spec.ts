import { validate } from 'class-validator';
import { CreateQrPaymentDto } from './create-qr-payment.dto';

describe('CreateQrPaymentDto amount', () => {
  const createDto = (amount: number) =>
    Object.assign(new CreateQrPaymentDto(), {
      merchantId: 'merchant-123456',
      amount,
      method: 'card',
    });

  it('accepts positive amounts below the former KES 10 minimum', async () => {
    await expect(validate(createDto(0.01))).resolves.toHaveLength(0);
  });

  it('accepts legacy checkout fields during rollout so older web builds can still initialize payments', async () => {
    const dto = Object.assign(createDto(10), {
      guestEmail: 'customer@example.com',
      guestPhone: '+254710484154',
      crypto: 'USDT',
      chain: 'BSC_MAINNET',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([0, -0.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid amount %s',
    async (amount) => {
      await expect(validate(createDto(amount))).resolves.not.toHaveLength(0);
    },
  );
});
