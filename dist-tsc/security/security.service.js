"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SecurityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const crypto = __importStar(require("crypto"));
let SecurityService = SecurityService_1 = class SecurityService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SecurityService_1.name);
    }
    async getSettings(userId) {
        this.logger.log(`Returning security settings for user=${userId}`);
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { pin_hash: true, failed_pin_attempts: true },
        });
        const biometricSettings = await this.prisma.biometric_settings.findUnique({
            where: { user_id: userId },
            select: { enabled: true },
        });
        return {
            two_factor: {
                enabled: false,
                provider: 'otp',
                enforce_for_withdrawals: true,
            },
            require_pin_for_transactions: true,
            has_pin: !!user?.pin_hash,
            pin_locked: (user?.failed_pin_attempts ?? 0) >= 5,
            biometrics_enabled: biometricSettings?.enabled ?? false,
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
    async enableBiometrics(userId, deviceFingerprint, biometricType) {
        if (!userId || !deviceFingerprint) {
            throw new common_1.BadRequestException('User ID and device fingerprint are required');
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
    async disableBiometrics(userId) {
        const settings = await this.prisma.biometric_settings.findUnique({
            where: { user_id: userId },
        });
        if (!settings) {
            throw new common_1.BadRequestException('Biometric settings not found');
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
    async verifyDevice(userId, deviceFingerprint) {
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
    async getBiometricStatus(userId) {
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
    async deleteBiometrics(userId) {
        const settings = await this.prisma.biometric_settings.findUnique({
            where: { user_id: userId },
        });
        if (!settings) {
            return {
                success: true,
                message: 'No biometric settings found for user',
            };
        }
        await this.prisma.biometric_settings.delete({ where: { id: settings.id } });
        this.logger.log(`Biometrics deleted for user=${userId}`);
        return {
            success: true,
            message: 'Biometric settings removed',
        };
    }
    hashFingerprint(fingerprint) {
        return crypto.createHash('sha256').update(fingerprint).digest('hex');
    }
    generateDeviceId() {
        return `device_${crypto.randomBytes(16).toString('hex')}`;
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = SecurityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SecurityService);
//# sourceMappingURL=security.service.js.map