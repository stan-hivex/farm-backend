import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = user?.id || request.headers['x-user-id'];
    if (!userId) throw new UnauthorizedException('Authentication required');

    const dbUser = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { kyc_status: true, kyc_level: true },
    });
    if (!dbUser) throw new UnauthorizedException('User not found');

    const requestPath = request.url ?? request.originalUrl ?? '';
    const isWithdrawCreate = request.method === 'POST' && requestPath.includes('/withdraw/create');
    const hasLevel2 = Number(dbUser.kyc_level || 0) >= 2;

    if (isWithdrawCreate && hasLevel2) return true;

    const approvedPartial = dbUser.kyc_status === 'additional_info_required' && hasLevel2;
    const fullyVerified = dbUser.kyc_status === 'verified' && hasLevel2;
    if (approvedPartial || fullyVerified) return true;

    throw new ForbiddenException('KYC approval required to perform this action');
  }
}
