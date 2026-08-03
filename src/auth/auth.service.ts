import {
  Injectable, BadRequestException, UnauthorizedException,
  ConflictException, ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TurnstileService } from '../common/services/turnstile.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  generateWalletAddress, generateOtp, generateReferralCode,
} from '../common/utils/reference.util';
import {
  MAX_PIN_ATTEMPTS, MAX_LOGIN_ATTEMPTS, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS,
} from '../common/constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private notifications: NotificationsService,
    private turnstile: TurnstileService,
  ) {}

  // ── Register ────────────────────────────────────────────────────────────────
  async register(dto: RegisterDto, ip: string, turnstileToken?: string) {
    // Validate Turnstile token (bot protection)
    if (turnstileToken) {
      await this.turnstile.verifyToken(turnstileToken, ip);
    }

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

    await this.sendOtp(user.id, user.phone, 'phone_verification');
    return { message: 'Registration successful. OTP sent to your phone number.' };
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

  // ── Login ────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip: string, userAgent: string, turnstileToken?: string) {
    // Validate Turnstile token (bot protection)
    if (turnstileToken) {
      await this.turnstile.verifyToken(turnstileToken, ip);
    }

    const normalizedIdentifier = dto.identifier.trim();
    const normalizedPhone = this.normalizePhoneNumber(normalizedIdentifier);

    const user = await this.prisma.users.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          {
            email: {
              equals: normalizedIdentifier,
              mode: 'insensitive' as any,
            },
          },
          {
            username: {
              equals: normalizedIdentifier,
              mode: 'insensitive' as any,
            },
          },
        ],
        is_deleted: false,
      },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    }) as any;

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.is_suspended) throw new ForbiddenException('Account suspended. Contact support.');
    if (!user.is_active) throw new ForbiddenException('Account is inactive.');

    const failedAttempts = user.failed_login_attempts ?? 0;

    if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      await this.prisma.security_events.create({
        data: {
          user_id: user.id,
          event_type: 'ACCOUNT_LOCKED',
          description: 'Too many failed login attempts',
          severity: 'high',
          ip_address: ip,
        },
      });
      throw new ForbiddenException('Account locked. Contact support.');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      await this.prisma.users.update({
        where: { id: user.id },
        data: { failed_login_attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failed_login_attempts: 0, last_login_at: new Date(), last_seen_at: new Date() },
    });

    const walletId = user.wallets[0]?.id;
    const userRole = (user.role ?? 'user').toString().toLowerCase();
    const tokens = await this.issueTokens(user.id, userRole, walletId);
    const rounds = Number(this.cfg.get('BCRYPT_ROUNDS')) || 12;

    await this.prisma.user_sessions.create({
      data: {
        user_id: user.id,
        refresh_token: await bcrypt.hash(tokens.refresh_token, rounds),
        jwt_id: tokens.jti,
        ip_address: ip,
        user_agent: userAgent,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.activity_logs.create({
      data: { user_id: user.id, activity: 'LOGIN_STEP_1', ip_address: ip },
    });

    return {
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: 900,
        phone: this.normalizePhoneNumber(user.phone),
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
          has_pin: !!user.pin_hash,
          profile_image: user.profile_image,
        },
      },
      message: 'Login successful',
    };
  }


  async supabaseLogin(supabaseToken: string, ip: string, userAgent: string, turnstileToken?: string) {
    if (turnstileToken) {
      await this.turnstile.verifyToken(turnstileToken, ip);
    }
    return { message: 'Supabase auth is not configured in this environment', data: {} };
  }

  async sendPasswordResetOtp(email: string, ip: string, turnstileToken?: string) {
    // Validate Turnstile token (bot protection)
    if (turnstileToken) {
      await this.turnstile.verifyToken(turnstileToken, ip);
    }
    return { message: 'Password reset flow is not configured in this environment' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    return { message: 'Password reset flow is not configured in this environment' };
  }

  async resendEmailVerification(email: string) {
    return { message: 'Email verification flow is not configured in this environment' };
  }

  async verifyEmail(token: string) {
    return { message: 'Email verification flow is not configured in this environment' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    return { message: 'Password change flow is not configured in this environment' };
  }

  async deleteAccount(userId: string) {
    return { message: 'Account deletion flow is not configured in this environment' };
  }

  async registerDeviceToken(userId: string, token: string, platform?: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Device token is required');
    }

    const existing = await this.prisma.device_tokens.findFirst({
      where: { user_id: userId, token: normalizedToken },
    });

    if (existing) {
      await this.prisma.device_tokens.update({
        where: { id: existing.id },
        data: { is_active: true, platform: platform || existing.platform, last_seen: new Date() },
      });
      return { message: 'Device token updated' };
    }

    await this.prisma.device_tokens.create({
      data: {
        user_id: userId,
        token: normalizedToken,
        platform: platform || 'unknown',
        is_active: true,
        last_seen: new Date(),
      },
    });

    return { message: 'Device token registered' };
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

  // Add this method inside the AuthService class

async resendOtp(userId: string) {
  const user = await this.prisma.users.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!user) throw new NotFoundException('User not found');
  return this.sendOtp(userId, user.phone, 'phone_verification');
}
  // ── Private helpers ───────────────────────────────────────────────────────────
  private normalizePhoneNumber(phone?: string | null) {
    if (!phone) return '';
    const digits = phone.toString().replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('254') && digits.length === 12) {
      return `+${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 10) {
      return `+254${digits.slice(1)}`;
    }
    if (digits.startsWith('254') && digits.length > 12) {
      return `+${digits.slice(0, 12)}`;
    }
    return `+${digits}`;
  }

  private async verifyFirebaseToken(token: string) {
    try {
      if (!admin.apps.length) {
        const projectId = this.cfg.get<string>('FIREBASE_PROJECT_ID');
        const credentialsPath = this.cfg.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

        if (credentialsPath) {
          admin.initializeApp({
            projectId: projectId || undefined,
            credential: admin.credential.applicationDefault(),
          });
        } else if (projectId) {
          admin.initializeApp({ projectId });
        } else {
          admin.initializeApp();
        }
      }
      return await admin.auth().verifyIdToken(token);
    } catch (error) {
      this.logger.warn(`Firebase token verification failed: ${error}`);
      throw new UnauthorizedException('Invalid Firebase verification token');
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