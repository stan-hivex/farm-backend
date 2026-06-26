import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export function assertResourceAccess(
  ownerId: string | null | undefined,
  currentUserId: string | undefined,
  resourceName = 'resource',
) {
  if (!currentUserId) {
    throw new UnauthorizedException('Authentication required');
  }

  if (!ownerId || ownerId !== currentUserId) {
    throw new ForbiddenException(`You do not have permission to access this ${resourceName}`);
  }
}
