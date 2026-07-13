import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { supabaseLogin: jest.Mock; register: jest.Mock; login: jest.Mock };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      supabaseLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('register uses Supabase auth when a Supabase token is provided', async () => {
    authService.supabaseLogin.mockResolvedValue({ message: 'ok' });

    const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

    await controller.register({ supabase_token: 'token-123' } as any, req);

    expect(authService.supabaseLogin).toHaveBeenCalledWith('token-123', '127.0.0.1', 'jest');
  });

  it('login forwards password-based requests through the existing auth service flow', () => {
    const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

    controller.login({ identifier: 'user@example.com', password: 'secret' } as any, req);

    expect(authService.login).toHaveBeenCalledWith(
      { identifier: 'user@example.com', password: 'secret' },
      '127.0.0.1',
      'jest',
      undefined,
    );
    expect(authService.supabaseLogin).not.toHaveBeenCalled();
  });
});

