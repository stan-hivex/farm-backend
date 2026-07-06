import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    prismaServiceMock = {
      users: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user_sessions: {
        deleteMany: jest.fn(),
      },
      activity_logs: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (operations: any[]) => Promise.all(operations)),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        switch (key) {
          case 'TURNSTILE_SECRET_KEY':
            return 'test-secret';
          case 'TURNSTILE_ENABLED':
            return 'true';
          case 'BCRYPT_ROUNDS':
            return 12;
          case 'QR_HMAC_SECRET':
            return 'qr-secret';
          default:
            return defaultValue;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaServiceMock },
        JwtService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('soft-deletes an account and revokes its sessions', async () => {
    prismaServiceMock.users.findUnique.mockResolvedValue({ id: 'user-123' });
    prismaServiceMock.users.update.mockResolvedValue({});
    prismaServiceMock.user_sessions.deleteMany.mockResolvedValue({ count: 2 });
    prismaServiceMock.activity_logs.create.mockResolvedValue({});

    const result = await service.deleteAccount('user-123');

    expect(result).toEqual({ message: 'Account deleted successfully' });
    expect(prismaServiceMock.users.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: expect.objectContaining({
        is_deleted: true,
        is_active: false,
      }),
    });
    expect(prismaServiceMock.user_sessions.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-123' },
    });
  });

  it('calculates progressive lockout minutes from failed login attempts', () => {
    expect((service as any).getLockoutMinutes(5)).toBe(5);
    expect((service as any).getLockoutMinutes(10)).toBe(10);
    expect((service as any).getLockoutMinutes(11)).toBe(15);
  });

  it('does not require email verification for legacy FARM users', () => {
    expect((service as any).shouldRequireEmailVerification({ supabase_user_id: null, email_verified: false })).toBe(false);
    expect((service as any).shouldRequireEmailVerification({ supabase_user_id: 'supabase-user-123', email_verified: false })).toBe(true);
    expect((service as any).shouldRequireEmailVerification({ supabase_user_id: 'supabase-user-123', email_verified: true })).toBe(false);
  });

  it('links an existing farm user to a Supabase identity on first login', async () => {
    prismaServiceMock.users.findFirst.mockResolvedValue({
      id: 'user-123',
      email: 'john@example.com',
      supabase_user_id: null,
      first_name: 'John',
      last_name: 'Doe',
      country: null,
      email_verified: false,
      phone: '254700000000',
      wallets: [],
      is_deleted: false,
    });
    prismaServiceMock.users.update.mockResolvedValue({ id: 'user-123' });

    const linkedUser = await (service as any).findOrLinkSupabaseUser(
      'john@example.com',
      'supabase-user-123',
      {
        firstName: 'John',
        lastName: 'Doe',
        country: 'Kenya',
        emailVerified: true,
        phone: '254700000000',
      },
    );

    expect(prismaServiceMock.users.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: expect.objectContaining({
        supabase_user_id: 'supabase-user-123',
        email_verified: true,
        country: 'Kenya',
      }),
    });
    expect(linkedUser).toBeDefined();
  });

  it('requires a turnstile token when captcha is enabled', async () => {
    await expect(
      service.login(
        { identifier: 'user@example.com', password: 'Password123!' } as any,
        '127.0.0.1',
        'jest',
        undefined,
      ),
    ).rejects.toThrow('Captcha verification is required');
  });
});
