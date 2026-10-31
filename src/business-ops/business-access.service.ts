import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  BusinessPermission,
  BusinessRole,
  can,
  permissionsFor,
} from './permissions';

export interface BusinessActor {
  userId: string;
  role: BusinessRole;
  business: {
    id: string;
    owner_user_id: string;
    merchant_id: string | null;
    status: string;
    legal_name: string | null;
    trading_name: string | null;
  };
}

/**
 * Resolves which approved business the user acts for and enforces the
 * role permission matrix. Every Phase 2 endpoint goes through here.
 */
@Injectable()
export class BusinessAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    userId: string,
    perm?: BusinessPermission,
  ): Promise<BusinessActor> {
    const select = {
      id: true,
      owner_user_id: true,
      merchant_id: true,
      status: true,
      legal_name: true,
      trading_name: true,
    } as const;
    let actor: BusinessActor | null = null;
    const owned = await this.prisma.businesses.findUnique({
      where: { owner_user_id: userId },
      select,
    });
    if (owned?.status === 'approved') {
      actor = { userId, role: 'owner', business: owned };
    } else {
      const membership = await this.prisma.business_members.findFirst({
        where: {
          user_id: userId,
          is_active: true,
          business: { status: 'approved' },
        },
        include: { business: { select } },
        orderBy: { created_at: 'asc' },
      });
      if (membership)
        actor = {
          userId,
          role: membership.role,
          business: membership.business,
        };
    }
    if (!actor)
      throw new NotFoundException('No approved business account found');
    if (perm && !can(actor.role, perm))
      throw new ForbiddenException(
        'Your business role does not allow this action',
      );
    return actor;
  }

  async context(userId: string) {
    const a = await this.resolve(userId);
    return {
      data: {
        business_id: a.business.id,
        name: a.business.trading_name || a.business.legal_name,
        role: a.role,
        permissions: permissionsFor(a.role),
      },
    };
  }
}
