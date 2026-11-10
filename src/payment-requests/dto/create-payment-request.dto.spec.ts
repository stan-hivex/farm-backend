import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentRequestDto } from './create-payment-request.dto';

describe('CreatePaymentRequestDto', () => {
  it('accepts the expiry field sent by older clients', async () => {
    const dto = plainToInstance(CreatePaymentRequestDto, {
      recipient_identifier: 'recipient',
      amount: 50,
      description: '',
      expires_at: '2026-11-10T09:00:00.000Z',
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('rejects an invalid expiry value', async () => {
    const dto = plainToInstance(CreatePaymentRequestDto, {
      recipient_identifier: 'recipient',
      amount: 50,
      expires_at: 'not-a-date',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('expires_at');
  });
});
