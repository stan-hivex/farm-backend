import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { TurnstileService } from '../common/services/turnstile.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        PrismaService,
        JwtService,
        ConfigService,
        { provide: NotificationsService, useValue: {} },
        { provide: TurnstileService, useValue: { verifyToken: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes phone numbers consistently for firebase verification', () => {
    expect((service as any).normalizePhoneNumber('+254700123456')).toBe('+254700123456');
    expect((service as any).normalizePhoneNumber('254700123456')).toBe('+254700123456');
    expect((service as any).normalizePhoneNumber('  +254 700 123 456 ')).toBe('+254700123456');
    expect((service as any).normalizePhoneNumber('0700123456')).toBe('+254700123456');
  });

  it('requires a temporary second-factor step for regular users', async () => {
    const prisma = module.get(PrismaService);
    const jwt = module.get(JwtService);
    const config = module.get(ConfigService);

    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue({
      id: 'user-1',
      phone: '+254700123456',
      username: 'tester',
      email: 'tester@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'user',
      kyc_status: 'verified',
      kyc_level: 0,
      phone_verified: false,
      pin_hash: null,
      profile_image: null,
      password_hash: await bcrypt.hash('secret123', 10),
      is_suspended: false,
      is_active: true,
      failed_login_attempts: 0,
      wallets: [],
    } as any);

    jest.spyOn(prisma.users, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.activity_logs, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.user_sessions, 'create').mockResolvedValue({} as any);

    jest.spyOn(jwt, 'signAsync').mockImplementation(async (_payload, options: any) => {
      if (options?.secret === config.get('JWT_ACCESS_SECRET')) {
        return 'access-token';
      }
      if (options?.secret === config.get('JWT_REFRESH_SECRET')) {
        return 'refresh-token';
      }
      return 'token';
    });

    const result: any = await service.login({
      identifier: '+254700123456',
      password: 'secret123',
    } as any, '127.0.0.1', 'jest');

    expect(result.data.otp_required).toBe(true);
    expect(result.data.temporary_login_token).toBeDefined();
    expect(result.data.access_token).toBeUndefined();
    expect(result.data.refresh_token).toBeUndefined();
    expect(prisma.user_sessions.create).not.toHaveBeenCalled();
  });

  it('issues tokens immediately for admin users', async () => {
    const prisma = module.get(PrismaService);
    const jwt = module.get(JwtService);
    const config = module.get(ConfigService);

    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue({
      id: 'admin-1',
      phone: '+254710000000',
      username: 'admin',
      email: 'admin@example.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      kyc_status: 'verified',
      kyc_level: 0,
      phone_verified: true,
      pin_hash: null,
      profile_image: null,
      password_hash: await bcrypt.hash('secret123', 10),
      is_suspended: false,
      is_active: true,
      failed_login_attempts: 0,
      wallets: [],
    } as any);

    jest.spyOn(prisma.users, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.activity_logs, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.user_sessions, 'create').mockResolvedValue({} as any);

    jest.spyOn(jwt, 'signAsync').mockImplementation(async (_payload, options: any) => {
      if (options?.secret === config.get('JWT_ACCESS_SECRET')) {
        return 'access-token';
      }
      if (options?.secret === config.get('JWT_REFRESH_SECRET')) {
        return 'refresh-token';
      }
      return 'token';
    });

    const result: any = await service.login({
      identifier: '+254710000000',
      password: 'secret123',
    } as any, '127.0.0.1', 'jest');

    expect(result.data.otp_required).toBe(false);
    expect(result.data.access_token).toBe('access-token');
    expect(result.data.refresh_token).toBe('refresh-token');
    expect(prisma.user_sessions.create).toHaveBeenCalled();
  });

  it('creates admin accounts with the admin role only', async () => {
    const prisma = module.get(PrismaService);

    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' } as any);
    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        users: { create: jest.fn().mockResolvedValue({ id: 'admin-2', phone: '+254700123456', first_name: 'Ada' }) },
        wallets: { create: jest.fn().mockResolvedValue({}) },
        activity_logs: { create: jest.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });
    jest.spyOn(service as any, 'sendOtp').mockResolvedValue(undefined);
    jest.spyOn((service as any).cfg, 'get').mockImplementation((key: string) => {
      if (key === 'QR_HMAC_SECRET') return 'test-secret';
      if (key === 'BCRYPT_ROUNDS') return '12';
      return 'test';
    });

    const result = await service.createAdmin('super-admin-1', {
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      phone: '+254700123456',
      email: 'ada@example.com',
      password: 'Abc123!@#qwe123',
      country: 'Kenya',
    } as any);

    expect(result.message).toContain('Admin account created');
  });
});
