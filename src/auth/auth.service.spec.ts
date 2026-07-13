import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        PrismaService,
        JwtService,
        ConfigService,
        { provide: NotificationsService, useValue: {} },
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
});
