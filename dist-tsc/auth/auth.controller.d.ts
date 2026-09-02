import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { SupabaseAuthDto } from './dto/supabase-auth.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(body: RegisterDto | SupabaseAuthDto, req: Request): Promise<{
        message: string;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        message: string;
        user_id: string;
    }>;
    resendOtp(body: {
        phone: string;
    }): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto, req: Request): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    resendEmailVerification(body: {
        email: string;
    }): Promise<{
        message: string;
    }>;
    verifyEmail(token: string | undefined, queryToken: string | undefined): Promise<{
        message: string;
    }>;
    login(body: LoginDto | SupabaseAuthDto, req: Request): Promise<{
        message: string;
        data: {};
    }>;
    firebaseLogin(dto: FirebaseLoginDto, req: Request): Promise<{
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
    resolveLoginEmail(body: {
        identifier: string;
    }): Promise<{
        data: {
            email: string;
        };
    }>;
    verifyPhone(dto: VerifyPhoneDto, req: Request): Promise<{
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
    supabaseAuth(dto: SupabaseAuthDto, req: Request): Promise<{
        message: string;
        data: {};
    }>;
    private isSupabaseAuthBody;
    honeypot(req: Request): Promise<{
        message: string;
    }>;
    honeypotConsole(req: Request): Promise<{
        message: string;
    }>;
    refresh(dto: RefreshTokenDto, req: Request): Promise<{
        data: {
            access_token: string;
            refresh_token: string;
            token_type: string;
            expires_in: number;
        };
        message: string;
    }>;
    registerDeviceToken(user: any, body: {
        token: string;
        platform?: string;
    }): Promise<{
        message: string;
    }>;
    logout(user: any): Promise<{
        message: string;
    }>;
    changePassword(user: any, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    deleteAccount(user: any, dto: DeleteAccountDto): Promise<{
        message: string;
    }>;
    getSessions(user: any): Promise<{
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
    revokeSession(user: any, sessionId: string): Promise<{
        message: string;
    }>;
    revokeOtherSessions(user: any): Promise<{
        message: string;
    }>;
    revokeAllSessions(user: any): Promise<{
        message: string;
    }>;
    setPin(user: any, dto: SetPinDto): Promise<{
        message: string;
    }>;
    changePin(user: any, dto: ChangePinDto): Promise<{
        message: string;
    }>;
    forgotPin(user: any, dto: ResetPinDto): Promise<{
        message: string;
    }>;
}
