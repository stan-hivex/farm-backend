import { BadRequestException, ForbiddenException } from '@nestjs/common';

/** PIN or the same device check wallet send already uses. Biometric failure does not fall through to PIN. */
export type SpendAuth = {
  pin?: string;
  biometric_auth?: boolean;
  device_fingerprint?: string;
  deviceFingerprint?: string;
};

export async function authorizeSpend(
  auth: { verifyPin(userId: string, pin: string): Promise<unknown> },
  security:
    | {
        verifyDevice(
          userId: string,
          deviceFingerprint: string,
        ): Promise<unknown>;
      }
    | undefined,
  userId: string,
  dto: SpendAuth,
): Promise<void> {
  if (dto.biometric_auth) {
    const deviceFingerprint = dto.device_fingerprint || dto.deviceFingerprint;
    if (!deviceFingerprint) {
      throw new BadRequestException(
        'Device fingerprint required for biometric authorization',
      );
    }
    if (!security) {
      throw new ForbiddenException('Biometric device verification failed');
    }
    const verified = await security.verifyDevice(userId, deviceFingerprint);
    if (
      !verified ||
      typeof verified !== 'object' ||
      !('trusted' in verified) ||
      (verified as { trusted?: unknown }).trusted !== true
    ) {
      throw new ForbiddenException('Biometric device verification failed');
    }
    return;
  }
  if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
  await auth.verifyPin(userId, dto.pin);
}
