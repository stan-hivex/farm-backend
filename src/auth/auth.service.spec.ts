import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { TurnstileService } from '../common/services/turnstile.service';
import { FirebaseService } from '../notifications/firebase.service';
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
        {
          provide: NotificationsService,
          useValue: {
            sendEmailOrThrow: jest.fn().mockResolvedValue(undefined),
            sendPush: jest.fn().mockResolvedValue(false),
            sendSms: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: TurnstileService, useValue: { verifyToken: jest.fn() } },
        {
          provide: FirebaseService,
          useValue: {
            verifyIdToken: jest.fn(),
            auth: {
              getUserByEmail: jest.fn(),
              createUser: jest.fn(),
              generatePasswordResetLink: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns from registration without waiting for Firebase account linking', async () => {
    const prisma = module.get(PrismaService);
    const config = module.get(ConfigService);
    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue(null);
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'QR_HMAC_SECRET' ? 'test-secret' : undefined,
      );
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (callback: any) =>
        callback({
          users: {
            create: jest.fn().mockResolvedValue({
              id: 'new-user',
              first_name: 'Test',
              phone: '+254700123456',
            }),
          },
          wallets: { create: jest.fn().mockResolvedValue({}) },
          activity_logs: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
    jest
      .spyOn(service, 'sendOtp')
      .mockResolvedValue({ message: 'OTP delivery started' });
    jest
      .spyOn(service as any, 'ensureFirebaseAccount')
      .mockReturnValue(new Promise(() => {}));

    await expect(
      service.register(
        {
          first_name: 'Test',
          last_name: 'User',
          username: 'test_user',
          phone: '+254700123456',
          email: 'test@example.com',
          password: 'NewSecure1!Password',
        } as any,
        '203.0.113.1',
      ),
    ).resolves.toEqual({
      message: 'Registration successful. OTP sent to your phone number.',
    });
    expect(service.sendOtp).toHaveBeenCalledWith(
      'new-user',
      '+254700123456',
      'phone_verification',
      true,
    );
  });

  it('checks email case-insensitively and phone uniqueness', async () => {
    const prisma = module.get(PrismaService);
    const findFirst = jest.spyOn(prisma.users, 'findFirst');
    findFirst
      .mockResolvedValueOnce({ id: 'existing-email' } as any)
      .mockResolvedValueOnce(null);

    await expect(
      service.checkRegistrationAvailability({
        email: '  Person@Example.com ',
        phone: ' +254700123456 ',
      }),
    ).resolves.toEqual({
      data: { emailAvailable: false, phoneAvailable: true },
    });
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { email: { equals: 'person@example.com', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { phone: '+254700123456' },
      select: { id: true },
    });
  });

  it('requires an email or phone for contact availability checks', async () => {
    await expect(service.checkRegistrationAvailability({})).rejects.toThrow(
      'Email or phone number is required',
    );
  });

  it('does not wait for SMS or push delivery when registering', async () => {
    const prisma = module.get(PrismaService);
    const notifications = module.get(NotificationsService);
    jest.spyOn(prisma.otp_verifications, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma.otp_verifications, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.user_settings, 'findUnique').mockResolvedValue({
      push_notifications: true,
    } as any);
    jest
      .spyOn(notifications, 'sendPush')
      .mockReturnValue(new Promise(() => {}) as any);

    await expect(
      service.sendOtp('user-1', '+254700123456', 'phone_verification', true),
    ).resolves.toEqual({ message: 'OTP delivery started' });
  });

  it('prepares an active regular user for Firebase password reset delivery', async () => {
    const prisma = module.get(PrismaService);
    const firebase = module.get(FirebaseService);
    const notifications = module.get(NotificationsService);
    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      firebase_uid: 'firebase-user-1',
      is_active: true,
      is_deleted: false,
      role: 'user',
    } as any);

    await expect(
      service.sendPasswordResetLink('PERSON@example.com'),
    ).resolves.toEqual({
      message:
        'If an active account exists for this email, a reset link has been sent.',
    });
    expect(firebase.auth.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(notifications.sendEmailOrThrow).not.toHaveBeenCalled();
  });

  it('does not reveal or send email for an unknown reset address', async () => {
    const prisma = module.get(PrismaService);
    const notifications = module.get(NotificationsService);
    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue(null);

    await expect(
      service.sendPasswordResetLink('missing@example.com'),
    ).resolves.toEqual({
      message:
        'If an active account exists for this email, a reset link has been sent.',
    });
    expect(notifications.sendEmailOrThrow).not.toHaveBeenCalled();
  });

  it('links an existing FARM account to Firebase before reset email delivery', async () => {
    const prisma = module.get(PrismaService);
    const firebase = module.get(FirebaseService);
    const findUser = jest
      .spyOn(prisma.users, 'findFirst')
      .mockResolvedValueOnce({
        id: 'user-2',
        email: 'person@example.com',
        firebase_uid: null,
        is_active: true,
        is_deleted: false,
        role: 'user',
      } as any)
      .mockResolvedValueOnce({ firebase_uid: null } as any);
    const updateUser = jest
      .spyOn(prisma.users, 'update')
      .mockResolvedValue({} as any);
    (firebase.auth.getUserByEmail as jest.Mock).mockResolvedValue({
      uid: 'firebase-user-2',
    });

    await service.sendPasswordResetLink('person@example.com');

    expect(findUser).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { firebase_uid: 'firebase-user-2' },
    });
  });

  it('synchronizes a reset regular-user password and revokes existing sessions', async () => {
    const prisma = module.get(PrismaService);
    const config = module.get(ConfigService);
    const firebase = module.get(FirebaseService);
    jest.spyOn(firebase, 'verifyIdToken').mockResolvedValue({
      uid: 'firebase-user-1',
      email: 'person@example.com',
    } as any);
    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      role: 'user',
      is_active: true,
      is_deleted: false,
    } as any);
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : undefined,
      );
    const updateUser = jest.fn().mockResolvedValue({});
    const revokeSessions = jest.fn().mockResolvedValue({});
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (callback: any) =>
        callback({
          users: { update: updateUser },
          user_sessions: { updateMany: revokeSessions },
        }),
      );

    await expect(
      service.completePasswordReset({
        firebase_id_token: 'firebase-token',
        password: 'NewSecure1!Password',
        confirm_password: 'NewSecure1!Password',
      }),
    ).resolves.toEqual({ message: 'Password reset successfully' });
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ failed_login_attempts: 0 }),
      }),
    );
    expect(revokeSessions).toHaveBeenCalledWith({
      where: { user_id: 'user-1', is_revoked: false },
      data: expect.objectContaining({ is_revoked: true }),
    });
  });

  it('normalizes phone numbers consistently for firebase verification', () => {
    expect((service as any).normalizePhoneNumber('+254700123456')).toBe(
      '+254700123456',
    );
    expect((service as any).normalizePhoneNumber('254700123456')).toBe(
      '+254700123456',
    );
    expect((service as any).normalizePhoneNumber('  +254 700 123 456 ')).toBe(
      '+254700123456',
    );
    expect((service as any).normalizePhoneNumber('0700123456')).toBe(
      '+254700123456',
    );
  });

  it('requires a temporary second-factor step for regular users', async () => {
    const prisma = module.get(PrismaService);
    const jwt = module.get(JwtService);
    const config = module.get(ConfigService);
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'REQUIRE_PHONE_VERIFICATION') return 'true';
      if (key === 'BCRYPT_ROUNDS') return '12';
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return undefined;
    });

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
    jest.spyOn(prisma.pending_login_verifications, 'create').mockResolvedValue({
      id: 'pending-1',
    } as any);

    jest
      .spyOn(jwt, 'signAsync')
      .mockImplementation(async (_payload, options: any) => {
        if (options?.secret === config.get('JWT_ACCESS_SECRET')) {
          return 'access-token';
        }
        if (options?.secret === config.get('JWT_REFRESH_SECRET')) {
          return 'refresh-token';
        }
        return 'token';
      });

    const result: any = await service.login(
      {
        identifier: '+254700123456',
        password: 'secret123',
      } as any,
      '127.0.0.1',
      'jest',
    );

    expect(result.data.requiresPhoneVerification).toBe(true);
    expect(result.data.pendingLoginId).toBe('pending-1');
    expect(result.data.access_token).toBeUndefined();
    expect(result.data.refresh_token).toBeUndefined();
    expect(prisma.user_sessions.create).not.toHaveBeenCalled();
  });

  it('issues a session directly when phone verification is explicitly disabled', async () => {
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
    jest.spyOn(prisma.user_sessions, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.activity_logs, 'create').mockResolvedValue({} as any);
    jest
      .spyOn(prisma.pending_login_verifications, 'create')
      .mockResolvedValue({} as any);
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'REQUIRE_PHONE_VERIFICATION') return 'false';
      if (key === 'BCRYPT_ROUNDS') return '12';
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return undefined;
    });
    jest.spyOn(jwt, 'signAsync').mockResolvedValue('token');

    const result: any = await service.login(
      { identifier: '+254700123456', password: 'secret123' } as any,
      '127.0.0.1',
      'jest',
    );

    expect(result.data.requiresPhoneVerification).toBe(false);
    expect(result.data.access_token).toBe('token');
    expect(prisma.pending_login_verifications.create).not.toHaveBeenCalled();
    expect(prisma.user_sessions.create).toHaveBeenCalled();
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

    jest
      .spyOn(jwt, 'signAsync')
      .mockImplementation(async (_payload, options: any) => {
        if (options?.secret === config.get('JWT_ACCESS_SECRET')) {
          return 'access-token';
        }
        if (options?.secret === config.get('JWT_REFRESH_SECRET')) {
          return 'refresh-token';
        }
        return 'token';
      });

    const result: any = await service.login(
      {
        identifier: '+254710000000',
        password: 'secret123',
      } as any,
      '127.0.0.1',
      'jest',
    );

    expect(result.data.requiresPhoneVerification).toBe(false);
    expect(result.data.access_token).toBe('access-token');
    expect(result.data.refresh_token).toBe('refresh-token');
    expect(prisma.user_sessions.create).toHaveBeenCalled();
  });

  it('creates admin accounts with the admin role only', async () => {
    const prisma = module.get(PrismaService);

    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' } as any);
    jest.spyOn(prisma.users, 'findFirst').mockResolvedValue(null);
    let createdUserRole: string | undefined;
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (callback: any) => {
        const tx = {
          users: {
            create: jest
              .fn()
              .mockImplementation(({ data }: { data: { role: string } }) => {
                createdUserRole = data.role;
                return {
                  id: 'admin-2',
                  phone: '+254700123456',
                  first_name: 'Ada',
                };
              }),
          },
          wallets: { create: jest.fn().mockResolvedValue({}) },
          activity_logs: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });
    jest.spyOn(service as any, 'sendOtp').mockResolvedValue(undefined);
    jest
      .spyOn((service as any).cfg, 'get')
      .mockImplementation((key: string) => {
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
    expect(createdUserRole).toBe('admin');
  });

  it('does not allow an admin to create another admin account', async () => {
    const prisma = module.get(PrismaService);
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ id: 'admin-1', role: 'admin' } as any);

    await expect(
      service.createAdmin('admin-1', {
        first_name: 'Ada',
        last_name: 'Lovelace',
        username: 'ada',
        phone: '+254700123456',
        email: 'ada@example.com',
        password: 'Abc123!@#qwe123',
        country: 'Kenya',
      } as any),
    ).rejects.toThrow('Only superadmins can create admin accounts');
  });

  it('resets a forgotten PIN, clears lockout attempts, and records the reset', async () => {
    const prisma = module.get(PrismaService);
    const config = module.get(ConfigService);
    const userPasswordHash = await bcrypt.hash('secret123', 4);
    const findUnique = jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({
        id: 'user-1',
        phone: '+254700123456',
        password_hash: userPasswordHash,
      } as any);
    const update = jest
      .spyOn(prisma.users, 'update')
      .mockResolvedValue({} as any);
    const createLog = jest
      .spyOn(prisma.activity_logs, 'create')
      .mockResolvedValue({} as any);
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : undefined,
      );

    await expect(
      service.resetForgottenPin('user-1', {
        phone: '0700 123 456',
        password: 'secret123',
        new_pin: '2580',
        confirm_pin: '2580',
      }),
    ).resolves.toEqual({ message: 'PIN reset successfully' });

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ failed_pin_attempts: 0 }),
    });
    const savedPinHash = update.mock.calls[0][0].data.pin_hash;
    await expect(bcrypt.compare('2580', savedPinHash)).resolves.toBe(true);
    expect(createLog).toHaveBeenCalledWith({
      data: { user_id: 'user-1', activity: 'RESET_FORGOTTEN_PIN' },
    });
  });

  it('rejects forgotten PIN resets when the supplied phone is not the account phone', async () => {
    const prisma = module.get(PrismaService);
    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue({
      id: 'user-1',
      phone: '+254700123456',
      password_hash: await bcrypt.hash('secret123', 4),
    } as any);
    const update = jest.spyOn(prisma.users, 'update');

    await expect(
      service.resetForgottenPin('user-1', {
        phone: '+254711111111',
        password: 'secret123',
        new_pin: '2580',
        confirm_pin: '2580',
      }),
    ).rejects.toThrow('Phone number does not match this account');

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects forgotten PIN resets when the account password is incorrect', async () => {
    const prisma = module.get(PrismaService);
    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue({
      id: 'user-1',
      phone: '+254700123456',
      password_hash: await bcrypt.hash('secret123', 4),
    } as any);
    const update = jest.spyOn(prisma.users, 'update');

    await expect(
      service.resetForgottenPin('user-1', {
        phone: '+254700123456',
        password: 'incorrect',
        new_pin: '2580',
        confirm_pin: '2580',
      }),
    ).rejects.toThrow('Incorrect password');

    expect(update).not.toHaveBeenCalled();
  });
});
