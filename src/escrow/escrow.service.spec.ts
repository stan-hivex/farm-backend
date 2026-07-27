import { NotFoundException } from '@nestjs/common';
import { EscrowService } from './escrow.service';

describe('EscrowService biometric authorization', () => {
  it('uses device verification instead of PIN when biometric auth is provided', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockRejectedValue(new NotFoundException('Buyer wallet not found')),
      },
    };

    const authService = {
      verifyPin: jest.fn(),
    };

    const securityService = {
      verifyDevice: jest.fn().mockResolvedValue({ trusted: true }),
    };

    const service = new EscrowService(
      prisma as any,
      authService as any,
      {} as any,
      {} as any,
      securityService as any,
    ) as any;

    await expect(
      service.create('buyer-id', {
        seller_identifier: 'seller',
        amount: 10,
        title: 'Test escrow',
        biometric_auth: true,
        device_fingerprint: 'fingerprint',
      } as any),
    ).rejects.toThrow(NotFoundException);

    expect(securityService.verifyDevice).toHaveBeenCalledWith('buyer-id', 'fingerprint');
    expect(authService.verifyPin).not.toHaveBeenCalled();
  });
});
