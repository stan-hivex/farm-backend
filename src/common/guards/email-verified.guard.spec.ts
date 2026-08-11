import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';
import { PrismaService } from '../../database/prisma.service';

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;
  let prismaServiceMock: { users: { findUnique: jest.Mock } };

  beforeEach(() => {
    prismaServiceMock = {
      users: {
        findUnique: jest.fn(),
      },
    };

    guard = new EmailVerifiedGuard(prismaServiceMock as unknown as PrismaService);
  });

  function createContext(userId: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId },
          headers: {},
        }),
      }),
    } as ExecutionContext;
  }

  it('allows access when the user record is missing', async () => {
    prismaServiceMock.users.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(createContext('user-1'))).resolves.toBe(true);
  });

  it('blocks users whose email is not verified', async () => {
    prismaServiceMock.users.findUnique.mockResolvedValue({
      email_verified: false,
    });

    await expect(guard.canActivate(createContext('user-2'))).rejects.toThrow(ForbiddenException);
  });
});
