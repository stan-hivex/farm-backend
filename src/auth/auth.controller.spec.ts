import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    supabaseLogin: jest.Mock;
    register: jest.Mock;
    login: jest.Mock;
    checkRegistrationAvailability: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      supabaseLogin: jest.fn(),
      checkRegistrationAvailability: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

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

  it('checks email and phone availability for registration', async () => {
    authService.checkRegistrationAvailability.mockResolvedValue({
      data: { emailAvailable: false, phoneAvailable: true },
    });

    await expect(
      controller.registrationAvailability('person@example.com', '+254700123456'),
    ).resolves.toEqual({
      data: { emailAvailable: false, phoneAvailable: true },
    });
    expect(authService.checkRegistrationAvailability).toHaveBeenCalledWith({
      email: 'person@example.com',
      phone: '+254700123456',
    });
  });

  it('forwards password login requests to the auth service', async () => {
    authService.login.mockResolvedValue({ message: 'ok' });
    const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;
    const body = { identifier: 'user@example.com', password: 'secret' };

    await controller.login(body as any, req);

    expect(authService.login).toHaveBeenCalledWith(body, '127.0.0.1', 'jest');
    expect(authService.supabaseLogin).not.toHaveBeenCalled();
  });
});
