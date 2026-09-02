import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FirebaseService } from '../notifications/firebase.service';
import { TurnstileService } from '../common/services/turnstile.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    private cfg;
    private notifications;
    private turnstile;
    private firebase;
    private readonly logger;
    constructor(prisma: PrismaService, jwt: JwtService, cfg: ConfigService, notifications: NotificationsService, turnstile: TurnstileService, firebase: FirebaseService);
    register(dto: RegisterDto, ip: string, turnstileToken?: string): Promise<{
        message: string;
    }>;
    createAdmin(actorUserId: string, dto: CreateAdminDto): Promise<{
        message: string;
    }>;
    verifyOtp(phone: string, otpCode: string, purpose?: string): Promise<{
        message: string;
        user_id: string;
    }>;
    login(dto: LoginDto, ip: string, userAgent: string, turnstileToken?: string): Promise<{
        success: boolean;
        data: {
            requiresPhoneVerification: boolean;
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
            user: {
                id: any;
                first_name: any;
                last_name: any;
                username: any;
                phone: any;
                email: any;
                role: any;
                kyc_status: any;
                kyc_level: any;
                phone_verified: any;
                has_pin: boolean;
                profile_image: any;
            };
            pendingLoginId?: undefined;
            phone?: undefined;
        };
        message: string;
    } | {
        success: boolean;
        data: {
            requiresPhoneVerification: boolean;
            pendingLoginId: string;
            phone: string;
            access_token?: undefined;
            refresh_token?: undefined;
            token_type?: undefined;
            expires_in?: undefined;
            user?: undefined;
        };
        message: string;
    }>;
    supabaseLogin(supabaseToken: string, ip: string, userAgent: string, turnstileToken?: string): Promise<{
        message: string;
        data: {};
    }>;
    firebaseLogin(dto: {
        identifier: string;
        firebase_token?: string;
        firebaseIdToken?: string;
        country_code?: string;
        cf_turnstile_response?: string;
        turnstile_token?: string;
    }, ip: string, userAgent: string): Promise<{
        success: boolean;
        data: {
            requiresPhoneVerification: boolean;
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
            user: {
                id: any;
                first_name: any;
                last_name: any;
                username: any;
                phone: any;
                email: any;
                role: any;
                kyc_status: any;
                kyc_level: any;
                phone_verified: any;
                has_pin: boolean;
                profile_image: any;
            };
        };
        message: string;
    } | {
        success: boolean;
        data: {
            requiresPhoneVerification: boolean;
            pendingLoginId: string;
            phone: string;
        };
        message: string;
    }>;
    resolveLoginEmail(identifier: string): Promise<{
        data: {
            email: string;
        };
    }>;
    private firebaseLoginResponse;
    private ensureFirebaseAccount;
    verifyPhone(firebaseIdToken: string, pendingLoginId: string, ip: string, userAgent: string): Promise<{
        success: boolean;
        data: {
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
            user: {
                id: any;
                first_name: any;
                last_name: any;
                username: any;
                phone: any;
                email: any;
                role: any;
                kyc_status: any;
                kyc_level: any;
                phone_verified: boolean;
                has_pin: boolean;
                profile_image: any;
            };
        };
        message: string;
    }>;
    sendPasswordResetOtp(email: string, ip: string, turnstileToken?: string): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    resendEmailVerification(email: string): Promise<{
        message: string;
    }>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{
        message: string;
    }>;
    registerDeviceToken(userId: string, token: string, platform?: string): Promise<{
        message: string;
    }>;
    refresh(userId: string, rawRefreshToken: string, ip?: string): Promise<{
        data: {
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
        };
        message: string;
    }>;
    logout(userId: string, currentJti?: string, revokeAll?: boolean): Promise<{
        message: string;
    }>;
    revokeOtherSessions(userId: string, currentJti?: string): Promise<{
        message: string;
    }>;
    getSessions(userId: string): Promise<{
        sessions: {
            id: string;
            created_at: Date | null;
            expires_at: Date | null;
            device_name: string | null;
            device_os: string | null;
            ip_address: string | null;
            user_agent: string | null;
            is_revoked: boolean | null;
            used_at: Date | null;
        }[];
    }>;
    revokeSession(userId: string, sessionId: string): Promise<{
        message: string;
    }>;
    triggerHoneypot(path: string, ip?: string, userAgent?: string): Promise<{
        message: string;
    }>;
    setPin(userId: string, dto: SetPinDto): Promise<{
        message: string;
    }>;
    verifyPin(userId: string, pin: string): Promise<void>;
    changePin(userId: string, dto: ChangePinDto): Promise<{
        message: string;
    }>;
    resetForgottenPin(userId: string, dto: ResetPinDto): Promise<{
        message: string;
    }>;
    sendOtp(userId: string, phone: string, purpose: string): Promise<{
        message: string;
    }>;
    resendOtp(userId: string): Promise<{
        message: string;
    }>;
    private normalizePhoneNumber;
    private issueTokens;
    private refreshSessionExpiry;
    private handleTokenTheft;
    cleanupExpiredSessions(): Promise<void>;
    private logSecurityEvent;
}
