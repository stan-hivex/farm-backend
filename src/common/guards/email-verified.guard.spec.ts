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

  it('allows legacy users without a Supabase identity even when email is not verified', async () => {
    prismaServiceMock.users.findUnique.mockResolvedValue({
      email_verified: false,
      supabase_user_id: null,
    });

    await expect(guard.canActivate(createContext('user-1'))).resolves.toBe(true);
  });

  it('blocks Supabase-linked users until their email is verified', async () => {
    prismaServiceMock.users.findUnique.mockResolvedValue({
      email_verified: false,
      supabase_user_id: 'supabase-user-1',
    });

    await expect(guard.canActivate(createContext('user-2'))).rejects.toThrow(ForbiddenException);
  });
});
