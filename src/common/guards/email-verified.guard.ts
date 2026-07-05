import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = user?.id || request.headers['x-user-id'];

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const dbUser = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { email_verified: true },
    });

    if (!dbUser) {
      throw new UnauthorizedException('User not found');
    }

    if (!dbUser.email_verified) {
      throw new ForbiddenException('Email verification required to access wallet features');
    }

    return true;
  }
}
