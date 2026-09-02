import { SecurityService } from './security.service';
declare class UpdateBiometricsDto {
    enabled: boolean;
    deviceFingerprint?: string;
    biometricType?: string;
}
declare class VerifyDeviceDto {
    deviceFingerprint: string;
}
declare class CreateBiometricsDto {
    deviceFingerprint: string;
    biometricType?: string;
}
export declare class SecurityController {
    private readonly svc;
    private readonly logger;
    constructor(svc: SecurityService);
    settings(user: any): Promise<{
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
    updateBiometrics(user: any, dto: UpdateBiometricsDto): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyDevice(user: any, dto: VerifyDeviceDto): Promise<{
        trusted: boolean;
        requiresReauth: boolean;
        message: string;
    }>;
    createBiometrics(user: any, dto: CreateBiometricsDto): Promise<{
        success: boolean;
        message: string;
        deviceId: string | null;
    }>;
    getBiometricStatus(user: any): Promise<{
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
    deleteBiometrics(user: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
