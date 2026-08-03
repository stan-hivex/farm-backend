wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwimport { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface EmailVerifiedUserRecord {
  email_verified?: boolean | null;
  supabase_user_id?: string | null;
}

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user?.id) {
      return true;
    }

    const dbUser = (await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { email_verified: true },
    })) as EmailVerifiedUserRecord | null;

    if (!dbUser || dbUser.supabase_user_id === undefined || dbUser.supabase_user_id === null) {
      return true;
    }

    if (dbUser.email_verified) {
      return true;
    }

    throw new ForbiddenException('Please verify your email address to continue');
  }
}
