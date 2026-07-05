import {
  Injectable, BadRequestException, UnauthorizedException,
  ConflictException, ForbiddenException, NotFoundException, InternalServerErrorException, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { createPublicKey, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  generateWalletAddress, generateOtp, generateReferralCode,
} from '../common/utils/reference.util';
import {
  PasswordResetRateLimiter,
  generatePasswordResetToken,
} from './password-reset.util';
import {
  MAX_PIN_ATTEMPTS, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_STEP_ATTEMPTS, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS,
} from '../common/constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordResetRateLimiter = new PasswordResetRateLimiter();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private notifications: NotificationsService,
  ) {}

  // ── Register ────────────────────────────────────────────────────────────────
  private buildAuthLinks(path: string, token: string, email?: string) {
    const frontendUrl = this.cfg.get<string>('FRONTEND_URL')?.replace(/\/$/, '');
    const appScheme = this.cfg.get<string>('APP_SCHEME') || 'farm';
    const appHost = this.cfg.get<string>('APP_HOST') || 'farm.com';

    const params = new URLSearchParams({ token });
    if (email) {
      params.set('email', email);
    }

    const query = params.toString();
    const webUrl = frontendUrl ? `${frontendUrl}${path}${query ? `?${query}` : ''}` : '';
    const appUrl = `${appScheme}://${appHost}${path}${query ? `?${query}` : ''}`;

    return { webUrl, appUrl };
  }

  private buildAuthEmailHtml({
    greeting,
    body,
    appUrl,
    webUrl,
  }: {
    greeting: string;
    body: string;
    appUrl: string;
    webUrl: string;
  }) {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>${greeting}</p>
        <p>${body}</p>
        <p><a href="${appUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">Open in app</a></p>
        <p><a href="${webUrl || appUrl}">Open in browser</a></p>
        <p>If you did not request this action, you can safely ignore this email.</p>
      </div>
    `.trim();
  }

  private async sendEmailVerification(userId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const token = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.otp_verifications.create({
      data: {
        user_id: userId,
        otp_code: token,
        purpose: 'email_verification',
        expires_at: expiresAt,
      },
    });

    const { webUrl, appUrl } = this.buildAuthLinks('/verify-email', token, normalizedEmail);
    const html = this.buildAuthEmailHtml({
      greeting: 'Hello there,',
      body: 'Please confirm your email address to activate your FARM account.',
      appUrl,
      webUrl,
    });

    await this.notifications.sendEmail(normalizedEmail, 'Verify your FARM email', html);
  }

  async register(dto: RegisterDto, ip: string, turnstileToken?: string) {
    await this.verifyTurnstileToken(turnstileToken, ip);

    const existing = await this.prisma.users.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          { username: dto.username.toLowerCase() },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });
    if (existing) {
      if (existing.phone === dto.phone) throw new ConflictException('Phone already registered');
      if (existing.username === dto.username.toLowerCase()) throw new ConflictException('Username taken');
      throw new ConflictException('Email already registered');
    }

    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;
    const password_hash = await bcrypt.hash(dto.password, rounds);

    let referred_by: string | undefined;
    if (dto.referral_code) {
      const referrer = await this.prisma.users.findFirst({
        where: { referral_code: dto.referral_code },
      });
      if (referrer) referred_by = referrer.id;
    }

    // QR_HMAC_SECRET must be set in environment (fail fast if missing)
    const qrSecret = this.cfg.get<string>('QR_HMAC_SECRET');
    if (!qrSecret) {
      throw new Error('QR_HMAC_SECRET not configured - wallet generation impossible');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.users.create({
        data: {
          first_name: dto.first_name,
          last_name: dto.last_name,
          username: dto.username.toLowerCase(),
          phone: dto.phone,
          email: dto.email,
          password_hash,
          country: dto.country,
          referred_by,
          referral_code: generateReferralCode(),
        },
      });
      await tx.wallets.create({
        data: {
          user_id: u.id,
          wallet_name: `${u.first_name}'s Wallet`,
          wallet_type: 'user',
          wallet_address: generateWalletAddress(u.id, qrSecret),
          currency: 'FARM',
        },
      });
      await tx.activity_logs.create({
        data: { user_id: u.id, activity: 'REGISTER', ip_address: ip },
      });
      return u;
    });

    const messages: string[] = [];
    await this.sendOtp(user.id, user.phone, 'phone_verification');
    messages.push('OTP sent to your phone number.');

    if (user.email) {
      await this.sendEmailVerification(user.id, user.email);
      messages.push('Verification email sent to your email address.');
    }

    return { message: messages.join(' ') };
  }

  // ── Verify OTP ───────────────────────────────────────────────────────────────
  async verifyOtp(phone: string, otpCode: string, purpose = 'phone_verification') {
    const user = await this.prisma.users.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('User not found');

    const otp = await this.prisma.otp_verifications.findFirst({
      where: { user_id: user.id, purpose, verified: false },
      orderBy: { created_at: 'desc' },
    });

    if (!otp) throw new BadRequestException('No active OTP found. Request a new one.');

const expiryDate = new Date(otp.expires_at as any);

if (isNaN(expiryDate.getTime())) {
  throw new BadRequestException('Invalid OTP expiry date');
}

if (new Date() > expiryDate) {
  throw new BadRequestException('OTP has expired');
}



    const attempts = otp.attempts ?? 0;

    if (attempts >= OTP_MAX_ATTEMPTS)
      throw new ForbiddenException('Too many attempts. Request a new OTP.');

    if (otp.otp_code !== otpCode) {
      await this.prisma.otp_verifications.update({
        where: { id: otp.id }, data: { attempts: { increment: 1 } },
      });
      const remaining = OTP_MAX_ATTEMPTS - attempts - 1;
      throw new BadRequestException(`Invalid OTP. ${remaining} attempt(s) remaining.`);
    }

    await this.prisma.otp_verifications.update({
      where: { id: otp.id }, data: { verified: true },
    });
    if (purpose === 'phone_verification') {
      await this.prisma.users.update({
        where: { id: user.id }, data: { phone_verified: true },
      });
    }
    return { message: 'OTP verified successfully', user_id: user.id };
  }

  async sendPasswordResetOtp(email: string, ip = '', turnstileToken?: string) {
    await this.verifyTurnstileToken(turnstileToken, ip);

    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitKey = `${normalizedEmail}:${ip || 'unknown'}`;

    if (!this.passwordResetRateLimiter.allowRequest(rateLimitKey)) {
      return { message: 'Too many password reset requests. Please try again shortly.' };
    }

    const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return { message: 'If the email exists, a password reset link has been sent.' };
    }
    if (user.is_deleted) {
      return { message: 'If the email exists, a password reset link has been sent.' };
    }

    const token = generatePasswordResetToken();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.otp_verifications.create({
      data: {
        user_id: user.id,
        otp_code: token,
        purpose: 'forgot_password',
        expires_at,
      },
    });

    const { webUrl, appUrl } = this.buildAuthLinks('/reset-password', token, normalizedEmail);
    const html = this.buildAuthEmailHtml({
      greeting: `Hello ${user.first_name || 'FARM user'},`,
      body: 'We received a request to reset your password. Use the secure link below to continue.',
      appUrl,
      webUrl,
    });

    await this.notifications.sendEmail(normalizedEmail, 'Reset your FARM password', html);
    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  async verifyEmail(token: string) {
    if (!token?.trim()) {
      throw new BadRequestException('A valid verification token is required');
    }

    const verification = await this.prisma.otp_verifications.findFirst({
      where: {
        otp_code: token.trim(),
        purpose: 'email_verification',
        verified: false,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!verification || !verification.user_id) {
      throw new BadRequestException('Invalid or expired email verification link');
    }

    const expiresAt = verification.expires_at ? new Date(verification.expires_at) : null;
    if (!expiresAt || new Date() > expiresAt) {
      throw new BadRequestException('Email verification link has expired');
    }

    const user = await this.prisma.users.findUnique({ where: { id: verification.user_id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email_verified) {
      return { message: 'Email already verified' };
    }

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: { email_verified: true },
      }),
      this.prisma.otp_verifications.update({
        where: { id: verification.id },
        data: { verified: true },
      }),
    ]);

    return { message: 'Email verified successfully' };
  }

  async resendEmailVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return { message: 'If the email exists, a verification email has been sent.' };
    }

    if (user.email_verified) {
      return { message: 'Email already verified' };
    }

    await this.sendEmailVerification(user.id, normalizedEmail);
    return { message: 'If the email exists, a verification email has been sent.' };
  }

  async changePassword(userId: string, dto: { current_password: string; new_password: string; confirm_password: string }) {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException('New passwords do not match');
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const validCurrentPassword = await bcrypt.compare(dto.current_password, user.password_hash);
    if (!validCurrentPassword) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;
    const password_hash = await bcrypt.hash(dto.new_password, rounds);

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: { password_hash, failed_login_attempts: 0 },
      }),
      this.prisma.user_sessions.updateMany({
        where: { user_id: user.id, is_revoked: false },
        data: { is_revoked: true },
      }),
      this.prisma.activity_logs.create({
        data: { user_id: user.id, activity: 'PASSWORD_CHANGED' },
      }),
    ]);

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        is_deleted: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_deleted) {
      return { message: 'Account deleted successfully' };
    }

    await this.deleteSupabaseUser(user.email);

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: {
          is_deleted: true,
          is_active: false,
          email_verified: false,
          phone_verified: false,
          failed_login_attempts: 0,
        },
      }),
      this.prisma.user_sessions.deleteMany({
        where: { user_id: user.id },
      }),
      this.prisma.activity_logs.create({
        data: { user_id: user.id, activity: 'ACCOUNT_DELETED' },
      }),
    ]);

    return { message: 'Account deleted successfully' };
  }

  private async deleteSupabaseUser(email?: string | null) {
    const supabaseUrl = this.cfg.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.cfg.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey || !email) {
      return;
    }

    try {
      const normalizedSupabaseUrl = supabaseUrl
        .replace(/\/rest\/v1\/?$/i, '')
        .replace(/\/$/, '');
      const adminBaseUrl = `${normalizedSupabaseUrl}/auth/v1/admin`;

      const lookupResponse = await axios.get(
        `${adminBaseUrl}/users?email=${encodeURIComponent(email)}`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          timeout: 10000,
        },
      );

      const users = Array.isArray(lookupResponse.data?.users)
        ? lookupResponse.data.users
        : [];
      const supabaseUser = users.find((candidate: any) => candidate?.email?.toLowerCase() === email.toLowerCase());
      const supabaseUserId = supabaseUser?.id;

      if (!supabaseUserId) {
        return;
      }

      await axios.delete(`${adminBaseUrl}/users/${supabaseUserId}`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        timeout: 10000,
      });
    } catch (error) {
      this.logger.warn(`Supabase account deletion failed for ${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.password !== dto.confirm_password) {
      throw new BadRequestException('Passwords do not match');
    }

    const token = (dto.token || dto.otp || '').trim();
    if (!token) {
      throw new BadRequestException('A valid password reset token is required');
    }

    const resetRecord = await this.prisma.otp_verifications.findFirst({
      where: {
        otp_code: token,
        purpose: 'forgot_password',
        verified: false,
      },
      orderBy: { created_at: 'desc' },
    });
    if (!resetRecord || !resetRecord.user_id) {
      throw new BadRequestException('Invalid or expired password reset link');
    }

    const expiresAt = resetRecord.expires_at ? new Date(resetRecord.expires_at) : null;
    if (!expiresAt || new Date() > expiresAt) {
      throw new BadRequestException('Password reset link has expired');
    }

    const user = await this.prisma.users.findUnique({ where: { id: resetRecord.user_id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email.trim().toLowerCase() !== user.email?.toLowerCase()) {
      throw new BadRequestException('Password reset token does not match the provided email');
    }

    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;
    const password_hash = await bcrypt.hash(dto.password, rounds);

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: { password_hash, failed_login_attempts: 0 },
      }),
      this.prisma.user_sessions.updateMany({
        where: { user_id: user.id, is_revoked: false },
        data: { is_revoked: true },
      }),
      this.prisma.otp_verifications.update({
        where: { id: resetRecord.id },
        data: { verified: true },
      }),
      this.prisma.activity_logs.create({
        data: { user_id: user.id, activity: 'PASSWORD_RESET' },
      }),
    ]);

    return { message: 'Password has been reset successfully' };
  }

  // ── Login ────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip: string, userAgent: string, turnstileToken?: string) {
    await this.verifyTurnstileToken(turnstileToken, ip);

    const normalizedIdentifier = dto.identifier.trim();
    const normalizedPhone = normalizedIdentifier.replace(/\s+/g, '');

    const user = await this.prisma.users.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { email: { equals: normalizedIdentifier, mode: 'insensitive' } },
          { username: { equals: normalizedIdentifier, mode: 'insensitive' } },
        ],
        is_deleted: false,
      },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.is_suspended) throw new ForbiddenException('Account suspended. Contact support.');
    if (!user.is_active) throw new ForbiddenException('Account is inactive.');
    if (user.email && !user.email_verified) {
      throw new ForbiddenException('Email not verified. Please verify your email before logging in.');
    }

    const failedAttempts = user.failed_login_attempts ?? 0;
    await this.enforceLoginLockout(user.id, user.login_lockout_until, ip);

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      const nextFailedAttempts = failedAttempts + 1;
      const lockoutMinutes = this.getLockoutMinutes(nextFailedAttempts);
      const lockoutDate = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      const shouldLockAccount = nextFailedAttempts >= LOGIN_LOCKOUT_STEP_ATTEMPTS;

      const updateData: Record<string, any> = {
        failed_login_attempts: nextFailedAttempts,
      };

      if (shouldLockAccount) {
        updateData.login_lockout_until = lockoutDate;
      }

      await this.prisma.users.update({
        where: { id: user.id },
        data: updateData,
      });

      if (shouldLockAccount) {
        await this.prisma.security_events.create({
          data: {
            user_id: user.id,
            event_type: 'ACCOUNT_LOCKED',
            description: `Account locked for ${lockoutMinutes} minute(s) after ${nextFailedAttempts} failed login attempts`,
            severity: 'high',
            ip_address: ip,
          },
        });
        throw new ForbiddenException(`Too many failed login attempts. Account locked for ${lockoutMinutes} minute(s).`);
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failed_login_attempts: 0, login_lockout_until: null, last_login_at: new Date(), last_seen_at: new Date() },
    });

    const walletId = user.wallets[0]?.id;
    const userRole = user.role ?? 'user';
    const tokens = await this.issueTokens(user.id, userRole, walletId);
    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

    await this.prisma.user_sessions.create({
      data: {
        user_id: user.id,
        refresh_token: await bcrypt.hash(tokens.refresh_token, rounds),
        jwt_id: tokens.jti, // Store the JWT ID for token revocation
        ip_address: ip,
        user_agent: userAgent,
        device_name: (dto as any).device_name,
        device_os: (dto as any).device_os,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.activity_logs.create({
      data: {
        user_id: user.id,
        activity: 'LOGIN',
        ip_address: ip,
      },
    });

    await this.sendLoginNotification(user.id, ip, userAgent);

    return {
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          phone: user.phone,
          email: user.email,
          role: user.role,
          kyc_status: user.kyc_status,
          kyc_level: user.kyc_level,
          phone_verified: user.phone_verified,
          email_verified: user.email_verified,
          has_pin: !!user.pin_hash,
          profile_image: user.profile_image,
        },
      },
      message: 'Login successful',
    };
  }

  // ── Supabase token exchange ─────────────────────────────────────────────────
  private jwksCache: Record<string, { keys: any[]; expiresAt: number }> = {};

  async supabaseLogin(supabaseToken: string, ip: string, userAgent: string, turnstileToken?: string) {
    await this.verifyTurnstileToken(turnstileToken, ip);

    const supabaseUrl = this.cfg.get<string>('SUPABASE_URL');

    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured.');
    }

    const normalizedSupabaseUrl = supabaseUrl
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/$/, '');

    const jwksUrl = `${normalizedSupabaseUrl}/auth/v1/.well-known/jwks.json`;

    let supabaseClaims: any;
    try {
      supabaseClaims = await this.verifySupabaseJwt(supabaseToken, jwksUrl, `${normalizedSupabaseUrl}/auth/v1`);
    } catch (error) {
      this.logger.warn('Supabase token verification failed', error as any);
      throw new UnauthorizedException('Invalid Supabase token.');
    }

    const email = supabaseClaims?.email?.toLowerCase();
    const emailVerified = !!supabaseClaims?.email_confirmed_at;
    const phone = supabaseClaims?.phone?.trim() || `supabase-${randomBytes(8).toString('hex')}`;
    const fallbackPhone = phone.startsWith('supabase-') ? null : phone;

    if (!email && !fallbackPhone) {
      throw new BadRequestException('Supabase user email or phone is required');
    }
    const metadata = supabaseClaims?.user_metadata ?? {};
    const supabaseUserId = (supabaseClaims?.sub || supabaseClaims?.id || supabaseClaims?.user_id || null) as string | null;
    const firstName = (metadata.first_name || metadata.name || email.split('@')[0] || 'Supabase').trim();
    const lastName = (metadata.last_name || 'User').trim();
    const usernameBase = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || `supabaseuser`;

    let username = usernameBase;
    let counter = 1;
    while (await this.prisma.users.findUnique({ where: { username } })) {
      username = `${usernameBase}${counter++}`;
    }

    let user = await this.findOrLinkSupabaseUser(email || null, supabaseUserId, {
      firstName,
      lastName,
      country: metadata.country,
      emailVerified,
      phone: fallbackPhone || phone,
    });

    if (!user) {
      const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;
      const password_hash = await bcrypt.hash(randomBytes(16).toString('hex'), rounds);

      const qrSecret = this.cfg.get<string>('QR_HMAC_SECRET');
      if (!qrSecret) {
        throw new Error('QR_HMAC_SECRET not configured - wallet generation impossible');
      }

      const createdUser = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.users.create({
          data: {
            first_name: firstName,
            last_name: lastName,
            username,
            email,
            phone,
            password_hash,
            country: metadata.country,
            email_verified: emailVerified,
            phone_verified: !!supabaseClaims?.phone,
            supabase_user_id: supabaseUserId,
            referral_code: generateReferralCode(),
          },
        });

        await tx.wallets.create({
          data: {
            user_id: createdUser.id,
            wallet_name: `${createdUser.first_name}'s Wallet`,
            wallet_type: 'user',
            wallet_address: generateWalletAddress(createdUser.id, qrSecret),
            currency: 'FARM',
          },
        });

        await tx.activity_logs.create({
          data: {
            user_id: createdUser.id,
            activity: 'SUPABASE_REGISTER',
            ip_address: ip,
          },
        });

        return createdUser;
      });

      // reload with wallet relation after creation
      user = await this.prisma.users.findUnique({
        where: { id: createdUser.id },
        include: { wallets: { where: { is_active: true }, take: 1 } },
      }) as any;

      if (!user) {
        throw new InternalServerErrorException('Failed to load created user');
      }

      if (this.shouldRequireEmailVerification(true, emailVerified)) {
        throw new ForbiddenException('Email not verified. Please verify your email before accessing the dashboard.');
      }
    } else {
      if (user.is_suspended) {
        throw new ForbiddenException('Account suspended. Contact support.');
      }
      if (!user.is_active) {
        throw new ForbiddenException('Account is inactive.');
      }

      if (emailVerified && !user.email_verified) {
        await this.prisma.users.update({
          where: { id: user.id },
          data: { email_verified: true },
        });
        user.email_verified = true;
      }
    }

    await this.enforceLoginLockout(user.id, user.login_lockout_until, ip);

    const walletId = user.wallets[0]?.id;
    const userRole = user.role ?? 'user';
    const tokens = await this.issueTokens(user.id, userRole, walletId);
    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

    await this.prisma.user_sessions.create({
      data: {
        user_id: user.id,
        refresh_token: await bcrypt.hash(tokens.refresh_token, rounds),
        jwt_id: tokens.jti,
        ip_address: ip,
        user_agent: userAgent,
        device_name: '',
        device_os: '',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.activity_logs.create({
      data: {
        user_id: user.id,
        activity: 'SUPABASE_LOGIN',
        ip_address: ip,
      },
    });

    await this.sendLoginNotification(user.id, ip, userAgent);

    return {
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          phone: user.phone,
          email: user.email,
          role: user.role,
          kyc_status: user.kyc_status,
          kyc_level: user.kyc_level,
          phone_verified: user.phone_verified,
          email_verified: user.email_verified,
          has_pin: !!user.pin_hash,
          profile_image: user.profile_image,
        },
      },
      message: 'Supabase login successful',
    };
  }

  private async findOrLinkSupabaseUser(
    email: string | null,
    supabaseUserId: string | null,
    details: {
      firstName: string;
      lastName: string;
      country?: string | null;
      emailVerified: boolean;
      phone: string | null;
    },
  ) {
    const normalizedPhone = details.phone?.trim() && !details.phone.startsWith('supabase-') ? details.phone.trim() : null;

    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
          ...(supabaseUserId ? [{ supabase_user_id: supabaseUserId }] : []),
        ],
        is_deleted: false,
      },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    }) as any;

    if (!existingUser) {
      return null;
    }

    const updateData: Record<string, any> = {};

    if (supabaseUserId && !existingUser.supabase_user_id) {
      updateData.supabase_user_id = supabaseUserId;
    }

    if (details.country && !existingUser.country) {
      updateData.country = details.country;
    }

    if (details.firstName && !existingUser.first_name) {
      updateData.first_name = details.firstName;
    }

    if (details.lastName && !existingUser.last_name) {
      updateData.last_name = details.lastName;
    }

    if (details.emailVerified && !existingUser.email_verified) {
      updateData.email_verified = true;
    }

    if (normalizedPhone && !existingUser.phone) {
      updateData.phone = normalizedPhone;
    }

    if (Object.keys(updateData).length > 0) {
      const updatedUser = await this.prisma.users.update({
        where: { id: existingUser.id },
        data: updateData,
      }) as any;

      return {
        ...existingUser,
        ...updatedUser,
        wallets: existingUser.wallets,
      };
    }

    return existingUser;
  }

  private shouldRequireEmailVerification(isNewUser: boolean, emailVerified: boolean): boolean {
    return isNewUser && !emailVerified;
  }

  private async verifySupabaseJwt(token: string, jwksUrl: string, expectedIssuer: string): Promise<any> {
    const decodedHeader = jwt.decode(token, { complete: true }) as any;
    const kid = decodedHeader?.header?.kid;
    if (!kid) {
      throw new UnauthorizedException('Missing token key ID');
    }

    const publicKey = await this.getSigningKey(kid, jwksUrl);
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: expectedIssuer,
      audience: 'authenticated',
    });
  }

  private async enforceLoginLockout(userId: string, lockoutUntilValue: Date | string | null | undefined, ip: string) {
    const lockoutUntil = lockoutUntilValue ? new Date(lockoutUntilValue) : null;

    if (lockoutUntil && lockoutUntil.getTime() > Date.now()) {
      const remainingMs = lockoutUntil.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: 'ACCOUNT_LOCKED',
          description: `Account temporarily locked for ${remainingMinutes} minute(s) due to repeated failed login attempts`,
          severity: 'high',
          ip_address: ip,
        },
      });
      throw new ForbiddenException(`Account temporarily locked. Try again in ${remainingMinutes} minute(s).`);
    }

    if (lockoutUntil && lockoutUntil.getTime() <= Date.now()) {
      await this.prisma.users.update({
        where: { id: userId },
        data: { login_lockout_until: null, failed_login_attempts: 0 },
      });
    }
  }

  private getLockoutMinutes(failedAttempts: number): number {
    if (failedAttempts <= 0) {
      return 0;
    }

    return Math.ceil(failedAttempts / LOGIN_LOCKOUT_STEP_ATTEMPTS) * LOGIN_LOCKOUT_STEP_ATTEMPTS;
  }

  private async getSigningKey(kid: string, jwksUrl: string): Promise<string> {
    const now = Date.now();
    let cache = this.jwksCache[jwksUrl];

    if (!cache || cache.expiresAt < now) {
      const response = await axios.get(jwksUrl, { timeout: 5000 });
      const keys = response.data?.keys;
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('Invalid JWKS response');
      }
      cache = { keys, expiresAt: now + 60 * 60 * 1000 }; // 1 hour cache
      this.jwksCache[jwksUrl] = cache;
    }

    const jwk = cache.keys.find((key) => key.kid === kid);
    if (!jwk) {
      throw new Error(`Unable to find signing key for kid ${kid}`);
    }

    return this.jwkToPem(jwk);
  }

  private parseBrowserAndOs(userAgent?: string) {
    const ua = userAgent?.trim() || '';
    const browser = /edg(e|a|i)/i.test(ua)
      ? 'Edge'
      : /opr|opera/i.test(ua)
      ? 'Opera'
      : /chrome/i.test(ua) && !/edg|opr|opera/i.test(ua)
      ? 'Chrome'
      : /firefox/i.test(ua)
      ? 'Firefox'
      : /safari/i.test(ua) && !/chrome/i.test(ua)
      ? 'Safari'
      : /msie|trident/i.test(ua)
      ? 'Internet Explorer'
      : 'Unknown browser';

    const os = /windows nt/i.test(ua)
      ? 'Windows'
      : /mac os x/i.test(ua)
      ? 'MacOS'
      : /android/i.test(ua)
      ? 'Android'
      : /iphone|ipad/i.test(ua)
      ? 'iOS'
      : /linux/i.test(ua)
      ? 'Linux'
      : 'Unknown OS';

    return { browser, os };
  }

  private async resolveLoginLocation(ip: string): Promise<string | null> {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) {
      return null;
    }

    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
      if (response.data?.status === 'success') {
        const city = response.data?.city?.trim();
        const country = response.data?.country?.trim();
        return [city, country].filter(Boolean).join(', ') || null;
      }
    } catch (error) {
      this.logger.debug(`Login location lookup failed for ${ip}: ${error}`);
    }

    return null;
  }

  private async sendLoginNotification(userId: string, ip: string, userAgent: string) {
    const { browser, os } = this.parseBrowserAndOs(userAgent);
    const location = await this.resolveLoginLocation(ip);
    const timestamp = new Date().toISOString();
    const bodyLines = [
      'New login detected',
      browser,
      os,
      location ?? 'Unknown location',
      ip,
      timestamp,
    ];

    const body = bodyLines.join('\n');
    const metadata = { browser, os, location, ip, timestamp };

    await this.notifications.createInApp(userId, {
      type: 'security',
      title: 'New login detected',
      body,
      metadata,
    });

    await this.notifications.sendPush(userId, 'New login detected', body, {
      event: 'login',
      ...metadata,
    });
  }

  private jwkToPem(jwk: any): string {
    if (jwk.kty !== 'RSA') {
      throw new Error(`Unsupported JWK key type: ${jwk.kty}`);
    }

    const keyObject = createPublicKey({
      key: {
        kty: 'RSA',
        n: jwk.n,
        e: jwk.e,
      },
      format: 'jwk',
    });

    return keyObject.export({ format: 'pem', type: 'spki' }).toString('utf8');
  }

  // ── Refresh ──────────────────────────────────────────────────────────────────
  async refresh(userId: string, rawRefreshToken: string, ip?: string) {
    // Find the most recent active session for this user
    const session = await this.prisma.user_sessions.findFirst({
      where: {
        user_id: userId,
        expires_at: { gt: new Date() },
        OR: [
          { is_revoked: false },
          { is_revoked: null },
        ],
      },
      orderBy: { created_at: 'desc' },
      include: {
        users: {
          include: { wallets: { take: 1 } }
        }
      },
    }) as any;

    if (!session) {
      await this.logSecurityEvent(userId, 'REFRESH_TOKEN_INVALID', 'No valid session found', 'high', ip);
      throw new UnauthorizedException('Session not found or expired');
    }

    if (session.users?.email && !session.users.email_verified) {
      await this.logSecurityEvent(userId, 'EMAIL_VERIFICATION_REQUIRED', 'Email not verified before refresh', 'medium', ip);
      throw new ForbiddenException('Email not verified. Please verify your email to refresh tokens.');
    }

    // Check if this refresh token has already been used (token reuse detection)
    if (session.used_at) {
      // Token has been used before - possible theft!
      await this.handleTokenTheft(userId, session, ip);
      throw new UnauthorizedException('Refresh token has been compromised. All sessions revoked.');
    }

    // Verify the refresh token hash
    const tokenValid = await bcrypt.compare(rawRefreshToken, session.refresh_token);
    if (!tokenValid) {
      await this.logSecurityEvent(userId, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token hash', 'high', ip);
      await this.handleTokenTheft(userId, session, ip);
      throw new UnauthorizedException('Invalid refresh token. All sessions revoked.');
    }

    // Mark this token as used (rotation)
    await this.prisma.user_sessions.update({
      where: { id: session.id },
      data: {
        used_at: new Date(),
        is_revoked: true // Revoke after use
      },
    });

    // Check for suspicious activity (different IP, user agent, etc.)
    if (ip && session.ip_address && session.ip_address !== ip) {
      await this.logSecurityEvent(
        userId,
        'SUSPICIOUS_ACTIVITY',
        `Refresh token used from different IP: ${ip} (original: ${session.ip_address})`,
        'medium',
        ip
      );
    }

    // Issue new tokens
    const walletId = session.users?.wallets[0]?.id;
    const userRole = session.users?.role ?? 'user';
    const tokens = await this.issueTokens(userId, userRole, walletId);
    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

    // Create new session with rotated refresh token
    await this.prisma.user_sessions.create({
      data: {
        user_id: userId,
        refresh_token: await bcrypt.hash(tokens.refresh_token, rounds),
        jwt_id: tokens.jti, // Store the new JWT ID
        ip_address: ip,
        user_agent: session.user_agent, // Keep same user agent
        device_name: session.device_name,
        device_os: session.device_os,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    await this.logSecurityEvent(userId, 'TOKEN_REFRESHED', 'Refresh token rotated successfully', 'low', ip);

    return {
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: 900,
      },
      message: 'Tokens refreshed successfully',
    };
  }

  // ── Logout ───────────────────────────────────────────────────────────────────
  async logout(userId: string, currentJti?: string, revokeAll = false) {
    if (revokeAll) {
      await this.prisma.user_sessions.updateMany({
        where: { user_id: userId, is_revoked: false },
        data: { is_revoked: true },
      });
    } else if (currentJti) {
      await this.prisma.user_sessions.updateMany({
        where: {
          user_id: userId,
          jwt_id: currentJti,
          OR: [
            { is_revoked: false },
            { is_revoked: null },
          ],
        },
        data: { is_revoked: true },
      });
    } else {
      await this.prisma.user_sessions.updateMany({
        where: { user_id: userId, is_revoked: false },
        data: { is_revoked: true },
      });
    }

    await this.prisma.activity_logs.create({
      data: { user_id: userId, activity: 'LOGOUT' },
    });
    return { message: 'Logged out successfully' };
  }

  async revokeOtherSessions(userId: string, currentJti?: string) {
    if (!currentJti) {
      throw new BadRequestException('Current session identifier missing');
    }

    await this.prisma.user_sessions.updateMany({
      where: {
        user_id: userId,
        jwt_id: { not: currentJti },
        OR: [
          { is_revoked: false },
          { is_revoked: null },
        ],
      },
      data: { is_revoked: true },
    });

    await this.prisma.activity_logs.create({
      data: {
        user_id: userId,
        activity: 'REVOKE_OTHER_SESSIONS',
      },
    });

    return { message: 'Other sessions revoked successfully' };
  }

  async getSessions(userId: string) {
    const sessions = await this.prisma.user_sessions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        device_name: true,
        device_os: true,
        ip_address: true,
        user_agent: true,
        is_revoked: true,
        used_at: true,
        expires_at: true,
        created_at: true,
      },
    });

    return { sessions };
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.user_sessions.findUnique({
      where: { id: sessionId },
      select: { user_id: true, is_revoked: true },
    });
    if (!session || session.user_id !== userId) {
      throw new UnauthorizedException('Session not found');
    }
    if (session.is_revoked) {
      return { message: 'Session already revoked' };
    }

    await this.prisma.user_sessions.update({
      where: { id: sessionId },
      data: { is_revoked: true },
    });

    await this.prisma.activity_logs.create({
      data: {
        user_id: userId,
        activity: 'REVOKE_SESSION',
        metadata: { session_id: sessionId },
      },
    });

    return { message: 'Session revoked successfully' };
  }

  async triggerHoneypot(path: string, ip?: string, userAgent?: string) {
    await this.prisma.security_events.create({
      data: {
        event_type: 'HONEYPOT_TRIGGERED',
        description: `Honeypot route accessed: ${path} | userAgent: ${userAgent || 'unknown'}`,
        severity: 'high',
        ip_address: ip,
      },
    });

    return { message: 'Not found' };
  }

  // ── Set PIN ───────────────────────────────────────────────────────────────────
 async setPin(userId: string, dto: SetPinDto) {
if (dto.pin !== dto.confirm_pin) {
throw new BadRequestException('PINs do not match');
}

if (!/^\d{4,6}$/.test(dto.pin)) {
throw new BadRequestException('PIN must be 4-6 digits');
}

const user = await this.prisma.users.findUnique({
where: { id: userId },
select: { pin_hash: true },
});

if (!user) {
throw new NotFoundException('User not found');
}

// 🚨 Prevent overwriting existing PIN
if (user.pin_hash) {
throw new ForbiddenException(
'PIN already exists. Use Change PIN instead.',
);
}

const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

// Security fix: Do NOT concatenate userId with PIN
// bcrypt generates its own salt - userId is public anyway
const pin_hash = await bcrypt.hash(dto.pin, rounds);

await this.prisma.users.update({
where: { id: userId },
data: {
pin_hash,
failed_pin_attempts: 0,
},
});

await this.prisma.activity_logs.create({
data: {
user_id: userId,
activity: 'SET_PIN',
},
});

return {
message: 'PIN set successfully',
};
}

  // ── Verify PIN (used by other services) ──────────────────────────────────────
  async verifyPin(userId: string, pin: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { pin_hash: true, failed_pin_attempts: true },
    });
    if (!user?.pin_hash) throw new BadRequestException('PIN not set. Please set a PIN first.');

    const failedPinAttempts = user.failed_pin_attempts ?? 0;

    if (failedPinAttempts >= MAX_PIN_ATTEMPTS)
      throw new ForbiddenException('PIN locked. Contact support.');

    // Compare the raw PIN to the stored bcrypt hash.
    // Historically some code concatenated the userId to the PIN before hashing,
    // but setPin/changePin/hash generation use the PIN alone. Use the raw PIN
    // so comparisons are consistent with how PINs are stored.
    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) {
      await this.prisma.users.update({
        where: { id: userId }, data: { failed_pin_attempts: { increment: 1 } },
      });
      const left = MAX_PIN_ATTEMPTS - failedPinAttempts - 1;
      throw new UnauthorizedException(`Incorrect PIN. ${left} attempt(s) remaining.`);
    }
    await this.prisma.users.update({
      where: { id: userId }, data: { failed_pin_attempts: 0 },
    });
  }

  async changePin(userId: string, dto: ChangePinDto) {
if (dto.new_pin !== dto.confirm_pin) {
throw new BadRequestException('New PINs do not match');
}
if (!/^\d{4,6}$/.test(dto.new_pin)) {
  throw new BadRequestException(
    'PIN must be 4-6 digits',
  );
}

const user = await this.prisma.users.findUnique({
where: { id: userId },
select: {
pin_hash: true,
},
});

if (!user?.pin_hash) {
throw new BadRequestException('No PIN found');
}

// Security fix: Don't concatenate userId with PIN
const validOldPin = await bcrypt.compare(dto.old_pin, user.pin_hash);

if (!validOldPin) {
  throw new UnauthorizedException('Old PIN is incorrect');
}

const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

const newHash = await bcrypt.hash(dto.new_pin, rounds);

await this.prisma.users.update({
where: { id: userId },
data: {
pin_hash: newHash,
failed_pin_attempts: 0,
},
});

await this.prisma.activity_logs.create({
data: {
user_id: userId,
activity: 'CHANGE_PIN',
},
});

return {
message: 'PIN changed successfully',
};
}

async resetForgottenPin(
  userId: string,
  dto: ResetPinDto,
) {
  if (dto.new_pin !== dto.confirm_pin) {
    throw new BadRequestException(
      'PINs do not match',
    );
  }
  if (!/^\d{4,6}$/.test(dto.new_pin)) {
    throw new BadRequestException(
      'PIN must be 4-6 digits',
    );
  }

  const user = await this.prisma.users.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  // VERIFY OTP
  await this.verifyOtp(
    user.phone,
    dto.otp,
    'forgot_pin',
  );

  // VERIFY PASSWORD
  const validPassword = await bcrypt.compare(
    dto.password,
    user.password_hash,
  );

  if (!validPassword) {
    throw new UnauthorizedException(
      'Incorrect password',
    );
  }

  const rounds =
    Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

  // Security fix: Don't concatenate userId with PIN
  const pin_hash = await bcrypt.hash(dto.new_pin, rounds);

  await this.prisma.users.update({
    where: { id: userId },
    data: {
      pin_hash,
      failed_pin_attempts: 0,
    },
  });

  await this.prisma.activity_logs.create({
    data: {
      user_id: userId,
      activity: 'RESET_FORGOTTEN_PIN',
    },
  });

  return {
    message: 'PIN reset successfully',
  };
}

// ── Send OTP ─────────────────────────────────────────────────────────────────
async sendOtp(userId: string, phone: string, purpose: string) {
  const recent = await this.prisma.otp_verifications.findFirst({
    where: {
      user_id: userId,
      purpose,
      verified: false,
      created_at: { gte: new Date(Date.now() - 60_000) },
    },
  });

  if (recent)
    throw new BadRequestException('Please wait 60 seconds before requesting a new OTP');

  const code = generateOtp(6);

  const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await this.prisma.otp_verifications.create({
    data: {
      user_id: userId,
      otp_code: code,
      purpose,
      expires_at,
    },
  });
  // Send OTP via configured SMS provider (do not log OTP contents)
  try {
    const message = `Your FARM OTP is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;
    // Prefer push if user has push notifications enabled and device tokens registered
    try {
      const settings = await this.prisma.user_settings.findUnique({ where: { user_id: userId } });
      if (settings?.push_notifications) {
        const pushBody = `Your FARM OTP is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;
        const pushed = await this.notifications.sendPush(userId, 'Your FARM OTP', pushBody, {
          otp_code: code,
          otp_expires: String(OTP_EXPIRY_MINUTES),
          purpose,
          auto_fill: 'true',
        });
        if (pushed) {
          return { message: 'OTP sent to your device' };
        }
      }
    } catch (e) {
      this.logger.debug('Push attempt failed or not configured: ' + e);
    }

    await this.notifications.sendSms(phone, message);
  } catch (e) {
    this.logger.error('OTP SMS send failed: ' + e);
  }

  return { message: 'OTP sent to your phone' };
}

  async resendOtp(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sendOtp(userId, user.phone, 'phone_verification');
  }

  // ── Private helpers ───────────────────────────────────────────────────────────
  private async verifyTurnstileToken(token?: string, ip?: string): Promise<void> {
    const secretKey = this.cfg.get<string>('TURNSTILE_SECRET_KEY');
    if (!secretKey) {
      return;
    }

    const enabled = this.cfg.get<string>('TURNSTILE_ENABLED')?.toLowerCase() !== 'false';
    if (!enabled) {
      return;
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Captcha verification is required');
    }

    try {
      const response = await axios.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        new URLSearchParams({
          secret: secretKey,
          response: normalizedToken,
          remoteip: ip || '',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );

      if (!response.data?.success) {
        throw new BadRequestException('Captcha verification failed');
      }
    } catch (error) {
      this.logger.warn(`Turnstile verification failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Captcha verification failed');
    }
  }

  private async issueTokens(userId: string, role: string, walletId?: string) {
    // Security: Secrets MUST be set in environment (no hardcoded fallbacks)
    const accessSecret = this.cfg.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.cfg.get<string>('JWT_REFRESH_SECRET');

    if (!accessSecret || !refreshSecret) {
      throw new Error(
        'JWT secrets not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in environment.',
      );
    }
    const jti = randomBytes(16).toString('hex');
    const payload = { sub: userId, role, wallet_id: walletId, jti };
    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: accessSecret,
        expiresIn: this.cfg.get('JWT_ACCESS_EXPIRES', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: this.cfg.get('JWT_REFRESH_EXPIRES', '30d'),
      }),
    ]);
    return { access_token, refresh_token, jti };
  }

  private async handleTokenTheft(userId: string, session: any, ip?: string) {
    // Revoke ALL active sessions for this user (token family rotation)
    await this.prisma.user_sessions.updateMany({
      where: { user_id: userId, is_revoked: false },
      data: { is_revoked: true },
    });

    // Log critical security event
    await this.logSecurityEvent(
      userId,
      'TOKEN_THEFT_DETECTED',
      `Refresh token reuse detected. Session ID: ${session.id}. All sessions revoked.`,
      'critical',
      ip
    );
    
    // Optional: Send alert email/SMS to user
    // TODO: Implement notification service call
    this.logger.warn(`🚨 TOKEN THEFT DETECTED for user ${userId} from IP ${ip}`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredSessions() {
    const deleted = await this.prisma.user_sessions.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });

    if (deleted.count > 0) {
      this.logger.log(`Cleaned up ${deleted.count} expired user session(s)`);
    }
  }

  private async logSecurityEvent(
    userId: string,
    eventType: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    ip?: string
  ) {
    try {
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: eventType,
          description,
          severity,
          ip_address: ip,
        },
      });

      if (severity === 'medium' || severity === 'high' || severity === 'critical') {
        const logMessage = `[SECURITY EVENT] ${severity.toUpperCase()} ${eventType} user=${userId} ip=${ip ?? 'unknown'} description=${description}`;
        if (severity === 'critical') {
          this.logger.error(logMessage, 'AuthService');
        } else {
          this.logger.warn(logMessage, 'AuthService');
        }
      }
    } catch (error: any) {
      // Don't fail the main operation if logging fails
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to log security event: ${message}`);
    }
  }
}