import { validate } from 'class-validator';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';

describe('CreateWithdrawDto', () => {
  it('accepts legacy walletAddress alias and crypto payload fields', async () => {
    const dto = Object.assign(new CreateWithdrawDto(), {
      amount: 130,
      method: 'CRYPTO',
      pin: '2580',
      cryptoAsset: 'USDT',
      cryptoAddress: '0xabc123',
      walletAddress: '0xabc123',
      network: 'BNB Smart Chain (BEP20)',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });
});
