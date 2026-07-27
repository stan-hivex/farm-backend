import { validate } from 'class-validator';
import { MerchantPayDto } from './qr.controller';

describe('MerchantPayDto', () => {
  it('rejects non-boolean biometric auth values', async () => {
    const dto = new MerchantPayDto();
    dto.qr_payload = 'payload';
    dto.amount = 10;
    (dto as any).biometric_auth = 'true';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'biometric_auth')).toBe(true);
  });
});
