import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import {
  AdminBusinessController,
  BusinessController,
} from './business.controller';

describe('Business controllers role metadata', () => {
  const reflector = new Reflector();

  it('restricts admin review endpoints to admin roles', () => {
    expect(reflector.get(ROLES_KEY, AdminBusinessController)).toEqual([
      'admin',
      'super_admin',
    ]);
  });

  it('does not put a role restriction on owner endpoints', () => {
    expect(reflector.get(ROLES_KEY, BusinessController)).toBeUndefined();
  });
});
