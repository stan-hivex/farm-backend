import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KycGuard } from '../common/guards/kyc.guard';

describe('WithdrawController', () => {
  let controller: WithdrawController;
  let service: WithdrawService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WithdrawController],
      providers: [
        {
          provide: WithdrawService,
          useValue: {
            createWithdrawal: jest.fn().mockResolvedValue({ success: true, reference: 'ref-1' }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(KycGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WithdrawController>(WithdrawController);
    service = module.get<WithdrawService>(WithdrawService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward walletaddress crypto withdrawals to WithdrawService', async () => {
    const dto: any = {
      amount: 200,
      method: 'CRYPTO',
      walletaddress: '0xabc',
      network: 'POLYGON',
      token: 'USDC',
      pin: '1234',
    };

    const result = await controller.create({ user: { id: 'user-1' } }, dto);

    expect(service.createWithdrawal).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ success: true, reference: 'ref-1' });
  });
});
