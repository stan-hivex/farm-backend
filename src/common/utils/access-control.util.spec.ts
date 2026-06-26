import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { assertResourceAccess } from './access-control.util';

describe('assertResourceAccess', () => {
  it('allows access when the authenticated user owns the resource', () => {
    expect(() => assertResourceAccess('user-1', 'user-1', 'withdrawal')).not.toThrow();
  });

  it('rejects access when the authenticated user is different from the owner', () => {
    expect(() => assertResourceAccess('user-1', 'user-2', 'withdrawal')).toThrow(ForbiddenException);
  });

  it('rejects access when no authenticated user is present', () => {
    expect(() => assertResourceAccess('user-1', undefined, 'withdrawal')).toThrow(UnauthorizedException);
  });
});
