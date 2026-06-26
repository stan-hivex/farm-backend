import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(private readonly prisma: PrismaService) {}

  getSettings() {
    this.logger.log('Returning security settings');
    return {
      two_factor: {
        enabled: false,
        provider: 'otp',
        enforce_for_withdrawals: true,
      },
      require_pin_for_transactions: true,
      session: {
        timeout_minutes: 60,
        refresh_grace_minutes: 5,
      },
      password_policy: {
        min_length: 8,
        require_numbers: true,
        require_symbols: false,
        require_mixed_case: false,
        expire_days: 0,
      },
      rate_limits: {
        login_attempts: { window_minutes: 15, max_attempts: 5 },
      },
      kyc: {
        require_verification_for_withdrawals: true,
        min_level_for_high_value: 2,
      },
      maintenance_mode: false,
      allowed_ip_ranges: [],
    };
  }

  async enableBiometrics(userId: string, deviceFingerprint: string, biometricType?: string) {
    if (!userId || !deviceFingerprint) {
      throw new BadRequestException('User ID and device fingerprint are required');
    }

    const existingSettings = await this.prisma.biometric_settings.findUnique({
      where: { user_id: userId },
    });

    const deviceId = this.generateDeviceId();

    const settings = await this.prisma.biometric_settings.upsert({
      where: { user_id: userId },
      update: {
        enabled: true,
        device_fingerprint: this.hashFingerprint(deviceFingerprint),
        device_id: deviceId,
        biometric_type: biometricType || 'faceID',
        trusted_device: true,
        last_verified_at: new Date(),
        verification_count: (existingSettings?.verification_count || 0) + 1,
        failed_attempts: 0,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        enabled: true,
        device_fingerprint: this.hashFingerprint(deviceFingerprint),
        device_id: deviceId,
        biometric_type: biometricType || 'faceID',
        trusted_device: true,
        verification_count: 1,
        failed_attempts: 0,
      },
    });

    this.logger.log(`Biometrics enabled for user=${userId}, device=${deviceId}`);

    return {
      success: true,
      message: 'Biometric verification enabled',
      deviceId: settings.device_id,
    };
  }

  async disableBiometrics(userId: string) {
    const settings = await this.prisma.biometric_settings.findUnique({
      where: { user_id: userId },
    });

    if (!settings) {
      throw new BadRequestException('Biometric settings not found');
    }

    await this.prisma.biometric_settings.update({
      where: { user_id: userId },
      data: {
        enabled: false,
        trusted_device: false,
        updated_at: new Date(),
      },
    });

    this.logger.log(`Biometrics disabled for user=${userId}`);

    return {
      success: true,
      message: 'Biometric verification disabled',
    };
  }

  async verifyDevice(userId: string, deviceFingerprint: string) {
    const settings = await this.prisma.biometric_settings.findUnique({
      where: { user_id: userId },
    });

    if (!settings || !settings.enabled) {
      return {
        trusted: false,
        requiresReauth: true,
        message: 'Biometrics not enabled',
      };
    }

    const currentHash = this.hashFingerprint(deviceFingerprint);
    const fingerprintMatches = currentHash === settings.device_fingerprint;

    if (!fingerprintMatches) {
      await this.prisma.biometric_settings.update({
        where: { user_id: userId },
        data: {
          failed_attempts: (settings.failed_attempts || 0) + 1,
        },
      });

      this.logger.warn(`Device fingerprint mismatch for user=${userId}`);

      return {
        trusted: false,
        requiresReauth: true,
        message: 'Device fingerprint verification failed - potential tampering detected',
      };
    }

    await this.prisma.biometric_settings.update({
      where: { user_id: userId },
      data: {
        last_verified_at: new Date(),
        verification_count: (settings.verification_count || 0) + 1,
        failed_attempts: 0,
      },
    });

    return {
      trusted: true,
      requiresReauth: false,
      message: 'Device verified successfully',
    };
  }

  async getBiometricStatus(userId: string) {
    const settings = await this.prisma.biometric_settings.findUnique({
      where: { user_id: userId },
    });

    if (!settings) {
      return {
        enabled: false,
        deviceId: null,
        lastVerified: null,
      };
    }

    return {
      enabled: settings.enabled,
      deviceId: settings.device_id,
      lastVerified: settings.last_verified_at,
      biometricType: settings.biometric_type,
      trustedDevice: settings.trusted_device,
    };
  }

  private hashFingerprint(fingerprint: string): string {
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }

  private generateDeviceId(): string {
    return `device_${crypto.randomBytes(16).toString('hex')}`;
  }
}
