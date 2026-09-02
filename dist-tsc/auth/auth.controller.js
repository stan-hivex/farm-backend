"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("./auth.service");
const firebase_login_dto_1 = require("./dto/firebase-login.dto");
const verify_phone_dto_1 = require("./dto/verify-phone.dto");
const supabase_auth_dto_1 = require("./dto/supabase-auth.dto");
const verify_otp_dto_1 = require("./dto/verify-otp.dto");
const set_pin_dto_1 = require("./dto/set-pin.dto");
const change_pin_dto_1 = require("./dto/change-pin.dto");
const reset_pin_dto_1 = require("./dto/reset-pin.dto");
const forgot_password_dto_1 = require("./dto/forgot-password.dto");
const reset_password_dto_1 = require("./dto/reset-password.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
const change_password_dto_1 = require("./dto/change-password.dto");
const delete_account_dto_1 = require("./dto/delete-account.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    register(body, req) {
        if (this.isSupabaseAuthBody(body)) {
            return this.authService.supabaseLogin(body.supabase_token, req.ip || '', req.headers['user-agent'] || '');
        }
        return this.authService.register(body, req.ip || '');
    }
    verifyOtp(dto) {
        return this.authService.verifyOtp(dto.phone, dto.otp_code, dto.purpose);
    }
    async resendOtp(body) {
        const user = await this.authService.prisma.users.findUnique({
            where: {
                phone: body.phone,
            },
        });
        if (!user) {
            return { message: 'If the phone number exists, an OTP was sent.' };
        }
        await this.authService.sendOtp(user.id, body.phone, 'phone_verification');
        return { message: 'If the phone number exists, an OTP was sent.' };
    }
    forgotPassword(dto, req) {
        return this.authService.sendPasswordResetOtp(dto.email, req.ip || '');
    }
    resetPassword(dto) {
        return this.authService.resetPassword(dto);
    }
    resendEmailVerification(body) {
        return this.authService.resendEmailVerification(body.email);
    }
    verifyEmail(token, queryToken) {
        return this.authService.verifyEmail(token || queryToken || '');
    }
    login(body, req) {
        if (this.isSupabaseAuthBody(body)) {
            return this.authService.supabaseLogin(body.supabase_token, req.ip || '', req.headers['user-agent'] || '');
        }
        return this.authService.login(body, req.ip || '', req.headers['user-agent'] || '');
    }
    firebaseLogin(dto, req) {
        return this.authService.firebaseLogin({
            ...dto,
            identifier: dto.identifier || '',
        }, req.ip || '', req.headers['user-agent'] || '');
    }
    resolveLoginEmail(body) {
        return this.authService.resolveLoginEmail(body.identifier);
    }
    async verifyPhone(dto, req) {
        return this.authService.verifyPhone(dto.firebaseIdToken, dto.pendingLoginId, req.ip || '', req.headers['user-agent'] || '');
    }
    supabaseAuth(dto, req) {
        return this.authService.supabaseLogin(dto.supabase_token, req.ip || '', req.headers['user-agent'] || '');
    }
    isSupabaseAuthBody(body) {
        return typeof body === 'object' && body !== null && typeof body.supabase_token === 'string' && body.supabase_token.trim().length > 0;
    }
    async honeypot(req) {
        return this.authService.triggerHoneypot('/api/v1/auth/admin/portal', req.ip || '', req.headers['user-agent'] || '');
    }
    async honeypotConsole(req) {
        return this.authService.triggerHoneypot('/api/v1/auth/admin/console', req.ip || '', req.headers['user-agent'] || '');
    }
    refresh(dto, req) {
        const decoded = decodeJwtPayload(dto.refresh_token);
        if (!decoded?.sub) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        return this.authService.refresh(decoded.sub, dto.refresh_token, req.ip || '');
    }
    async registerDeviceToken(user, body) {
        return this.authService.registerDeviceToken(user.id, body.token, body.platform);
    }
    logout(user) {
        return this.authService.logout(user.id, user.jti);
    }
    changePassword(user, dto) {
        return this.authService.changePassword(user.id, dto);
    }
    deleteAccount(user, dto) {
        return this.authService.deleteAccount(user.id, dto);
    }
    getSessions(user) {
        return this.authService.getSessions(user.id);
    }
    revokeSession(user, sessionId) {
        return this.authService.revokeSession(user.id, sessionId);
    }
    revokeOtherSessions(user) {
        return this.authService.revokeOtherSessions(user.id, user.jti);
    }
    revokeAllSessions(user) {
        return this.authService.logout(user.id, undefined, true);
    }
    setPin(user, dto) {
        return this.authService.setPin(user.id, dto);
    }
    changePin(user, dto) {
        return this.authService.changePin(user.id, dto);
    }
    forgotPin(user, dto) {
        return this.authService.resetForgottenPin(user.id, dto);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register'),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 60,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Register new user',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('verify-otp'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 60,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify OTP',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_otp_dto_1.VerifyOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('resend-otp'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 3,
            ttl: 60,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Resend OTP',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 300,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({ summary: 'Send password reset OTP to email' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_1.ForgotPasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 300,
        },
    }),
    (0, swagger_1.ApiOperation)({ summary: 'Reset password using OTP' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('resend-email-verification'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 3,
            ttl: 60000,
        },
    }),
    (0, swagger_1.ApiOperation)({ summary: 'Resend email verification link' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resendEmailVerification", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('verify-email/:token'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Verify email address' }),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 60,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Login',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('firebase-login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 60,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({ summary: 'Complete login with a verified Firebase ID token' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [firebase_login_dto_1.FirebaseLoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "firebaseLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('resolve-login-email'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 10,
            ttl: 60,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve a FARM phone or username to its login email' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resolveLoginEmail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('verify-phone'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Verify phone using Firebase ID token' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_phone_dto_1.VerifyPhoneDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyPhone", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('supabase'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 5,
            ttl: 60,
            generateKey: authThrottleKey,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Login or register with a Supabase access token',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [supabase_auth_dto_1.SupabaseAuthDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "supabaseAuth", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/portal'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Honeypot admin portal access' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "honeypot", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/console'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Honeypot admin console access' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "honeypotConsole", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 6,
            ttl: 60000,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Refresh token',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Post)('device-token'),
    (0, permissions_decorator_1.Permissions)('sessions:write'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Register a device token for push notifications' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerDeviceToken", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Post)('logout'),
    (0, permissions_decorator_1.Permissions)('sessions:write'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 10,
            ttl: 60000,
        },
    }),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({
        summary: 'Logout',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Post)('change-password'),
    (0, permissions_decorator_1.Permissions)('auth:write'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Change password and revoke all other sessions' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_password_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Delete)('delete-account'),
    (0, permissions_decorator_1.Permissions)('auth:write'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete the current account and revoke all sessions' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, delete_account_dto_1.DeleteAccountDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('sessions:read'),
    (0, common_1.Get)('sessions'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List active sessions for the current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getSessions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('sessions:write'),
    (0, common_1.Post)('sessions/:id/revoke'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke a session by ID for the current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revokeSession", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('sessions:write'),
    (0, common_1.Post)('sessions/revoke-others'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke all other sessions for the current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revokeOtherSessions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('sessions:write'),
    (0, common_1.Post)('sessions/revoke-all'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke all active sessions for the current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revokeAllSessions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Post)('set-pin'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({
        summary: 'Set PIN',
    }),
    (0, permissions_decorator_1.Permissions)('auth:write'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, set_pin_dto_1.SetPinDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "setPin", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Post)('change-pin'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({
        summary: 'Change PIN',
    }),
    (0, permissions_decorator_1.Permissions)('auth:write'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_pin_dto_1.ChangePinDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePin", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Post)('forgot-pin'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({
        default: {
            limit: 3,
            ttl: 300000,
        },
    }),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({
        summary: 'Reset forgotten PIN',
    }),
    (0, permissions_decorator_1.Permissions)('auth:write'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, reset_pin_dto_1.ResetPinDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPin", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)({
        path: 'auth',
        version: '1',
    }),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
function decodeJwtPayload(token) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
function authThrottleKey(context) {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || 'unknown-ip';
    const body = request.body || {};
    const identifier = (body.identifier || body.email || body.phone || body.supabase_token || '').toString().trim().toLowerCase();
    return identifier.length > 0
        ? `${ip}:${identifier}`
        : `${ip}:anonymous`;
}
//# sourceMappingURL=auth.controller.js.map