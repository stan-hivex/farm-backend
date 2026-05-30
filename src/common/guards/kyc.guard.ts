import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    const dbUser = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { kyc_status: true },
    });
    if (dbUser?.kyc_status !== 'verified') {
      throw new ForbiddenException(
        'KYC verification required. Please submit your identity documents.',
      );
    }
    return true;
  }
}