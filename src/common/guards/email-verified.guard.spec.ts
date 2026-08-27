import { ExecutionContext } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;

  beforeEach(() => {
    guard = new EmailVerifiedGuard();
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

  it('allows authenticated users without requiring email verification', () => {
    expect(guard.canActivate(createContext('user-2'))).toBe(true);
  });
});
