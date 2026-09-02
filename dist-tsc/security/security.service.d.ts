import { PrismaService } from '../database/prisma.service';
export declare class SecurityService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getSettings(userId: string): Promise<{
        two_factor: {
            enabled: boolean;
            provider: string;
            enforce_for_withdrawals: boolean;
        };
        require_pin_for_transactions: boolean;
        has_pin: boolean;
        pin_locked: boolean;
        biometrics_enabled: boolean;
        session: {
            timeout_minutes: number;
            refresh_grace_minutes: number;
        };
        password_policy: {
            min_length: number;
            require_numbers: boolean;
            require_symbols: boolean;
            require_mixed_case: boolean;
            expire_days: number;
        };
        rate_limits: {
            login_attempts: {
                window_minutes: number;
                max_attempts: number;
            };
        };
        kyc: {
            require_verification_for_withdrawals: boolean;
            min_level_for_high_value: number;
        };
        maintenance_mode: boolean;
        allowed_ip_ranges: never[];
    }>;
    enableBiometrics(userId: string, deviceFingerprint: string, biometricType?: string): Promise<{
        success: boolean;
        message: string;
        deviceId: string | null;
    }>;
    disableBiometrics(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyDevice(userId: string, deviceFingerprint: string): Promise<{
        trusted: boolean;
        requiresReauth: boolean;
        message: string;
    }>;
    getBiometricStatus(userId: string): Promise<{
        enabled: boolean;
        deviceId: null;
        lastVerified: null;
        biometricType?: undefined;
        trustedDevice?: undefined;
    } | {
        enabled: boolean;
        deviceId: string | null;
        lastVerified: Date | null;
        biometricType: string | null;
        trustedDevice: boolean;
    }>;
    deleteBiometrics(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private hashFingerprint;
    private generateDeviceId;
}
