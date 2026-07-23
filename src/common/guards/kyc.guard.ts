import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class KycGuard implements CanActivate {
  private readonly logger = new Logger(KycGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.id) throw new UnauthorizedException('Authentication required');
    const userId = user.id;

    const dbUser = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { kyc_status: true, kyc_level: true },
    });
    if (!dbUser) throw new UnauthorizedException('User not found');

    const requestPath = request.path ?? request.url ?? request.originalUrl ?? '';
    const isWithdrawCreate = request.method === 'POST' && requestPath.includes('/withdraw/create');
    const hasLevel2 = Number(dbUser.kyc_level || 0) >= 2;

    if (dbUser.kyc_status === 'verified') {
      this.logger.debug(`KYC passed for user=${userId} status=verified level=${dbUser.kyc_level}`);
      return true;
    }

    if (isWithdrawCreate && hasLevel2) {
      this.logger.debug(`KYC withdraw create passed for user=${userId} path=${requestPath} level=${dbUser.kyc_level}`);
      return true;
    }

    const approvedPartial = dbUser.kyc_status === 'additional_info_required' && hasLevel2;
    if (approvedPartial) {
      this.logger.debug(`KYC passed for additional info required user=${userId} level=${dbUser.kyc_level}`);
      return true;
    }

    this.logger.warn(`KYC denied for user=${userId} status=${dbUser.kyc_status} level=${dbUser.kyc_level} path=${requestPath}`);
    throw new ForbiddenException('KYC approval required to perform this action');
  }
}
