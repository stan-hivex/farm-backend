import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { authorizeSpend } from './authorize-spend';

describe('authorizeSpend', () => {
  const auth = { verifyPin: jest.fn().mockResolvedValue(undefined) };
  const security = {
    verifyDevice: jest.fn().mockResolvedValue({ trusted: true }),
  };

  beforeEach(() => {
    auth.verifyPin.mockClear();
    security.verifyDevice.mockClear();
    security.verifyDevice.mockResolvedValue({ trusted: true });
  });

  it('checks the PIN once when biometrics are not used', async () => {
    await authorizeSpend(auth, security, 'user-1', { pin: '1234' });
    expect(auth.verifyPin).toHaveBeenCalledWith('user-1', '1234');
    expect(security.verifyDevice).not.toHaveBeenCalled();
  });

  it('verifies the device and does not touch the PIN lock', async () => {
    await authorizeSpend(auth, security, 'user-1', {
      biometric_auth: true,
      device_fingerprint: 'fp',
    });
    expect(security.verifyDevice).toHaveBeenCalledWith('user-1', 'fp');
    expect(auth.verifyPin).not.toHaveBeenCalled();
  });

  it('rejects a failed device check without falling through to the PIN', async () => {
    security.verifyDevice.mockResolvedValue({ trusted: false });
    await expect(
      authorizeSpend(auth, security, 'user-1', {
        biometric_auth: true,
        device_fingerprint: 'fp',
        pin: '1234',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.verifyPin).not.toHaveBeenCalled();
  });

  it('requires a fingerprint and a PIN when neither is supplied', async () => {
    await expect(
      authorizeSpend(auth, security, 'user-1', { biometric_auth: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      authorizeSpend(auth, security, 'user-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
