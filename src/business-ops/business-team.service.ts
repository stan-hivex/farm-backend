import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BusinessAccessService } from './business-access.service';
import { assignableRoles, BusinessRole, permissionsFor } from './permissions';
import { AddMemberDto, ProfileDto, UpdateMemberDto } from './business-ops.dto';

const userSelect = {
  id: true,
  username: true,
  full_name: true,
  phone: true,
  email: true,
} as const;

@Injectable()
export class BusinessTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly auth: AuthService,
  ) {}

  async list(userId: string) {
    const a = await this.access.resolve(userId, 'team:read');
    const [owner, members] = await Promise.all([
      this.prisma.users.findUnique({
        where: { id: a.business.owner_user_id },
        select: userSelect,
      }),
      this.prisma.business_members.findMany({
        where: { business_id: a.business.id, is_active: true },
        include: { user: { select: userSelect } },
        orderBy: { created_at: 'asc' },
      }),
    ]);
    return {
      data: [
        {
          id: null,
          role: 'owner',
          user: owner,
          permissions: permissionsFor('owner'),
        },
        ...members.map((m) => ({
          id: m.id,
          role: m.role,
          user: m.user,
          created_at: m.created_at,
          permissions: permissionsFor(m.role),
        })),
      ],
      meta: { my_role: a.role, assignable_roles: assignableRoles(a.role) },
    };
  }

  async add(userId: string, dto: AddMemberDto) {
    const a = await this.access.resolve(userId, 'team:manage');
    this.assertAssignable(a.role, dto.role as BusinessRole);
    await this.auth.verifyPin(userId, dto.pin);
    const ident = dto.identifier.trim();
    const target = await this.prisma.users.findFirst({
      where: {
        OR: [{ username: ident }, { phone: ident }, { email: ident }],
        is_deleted: false,
        is_active: true,
      },
      select: { id: true },
    });
    if (!target)
      throw new NotFoundException(
        'No Farm user found with that username, phone or email',
      );
    if (target.id === a.business.owner_user_id)
      throw new BadRequestException('The owner is already on the team');
    const existing = await this.prisma.business_members.findUnique({
      where: {
        business_id_user_id: { business_id: a.business.id, user_id: target.id },
      },
    });
    if (existing?.is_active)
      throw new ConflictException('This user is already a team member');
    const member = existing
      ? await this.prisma.business_members.update({
          where: { id: existing.id },
          data: { is_active: true, role: dto.role as any, invited_by: userId },
        })
      : await this.prisma.business_members.create({
          data: {
            business_id: a.business.id,
            user_id: target.id,
            role: dto.role as any,
            invited_by: userId,
          },
        });
    await this.prisma.notifications.create({
      data: {
        user_id: target.id,
        type: 'merchant',
        title: 'Added to a business team',
        body: `You were added to ${a.business.trading_name || a.business.legal_name} as ${dto.role}.`,
      } as any,
    });
    await this.audit(userId, 'business.member_added', a.business.id, {
      member_id: member.id,
      role: dto.role,
    });
    return { data: member, message: 'Team member added' };
  }

  async update(userId: string, memberId: string, dto: UpdateMemberDto) {
    const a = await this.access.resolve(userId, 'team:manage');
    const m = await this.memberOf(a.business.id, memberId);
    this.assertAssignable(a.role, m.role);
    this.assertAssignable(a.role, dto.role as BusinessRole);
    if (m.user_id === userId)
      throw new ForbiddenException('You cannot change your own role');
    await this.auth.verifyPin(userId, dto.pin);
    const updated = await this.prisma.business_members.update({
      where: { id: m.id },
      data: { role: dto.role as any },
    });
    await this.audit(userId, 'business.member_role_changed', a.business.id, {
      member_id: m.id,
      from: m.role,
      to: dto.role,
    });
    return { data: updated, message: 'Role updated' };
  }

  async remove(userId: string, memberId: string, pin: string) {
    const a = await this.access.resolve(userId, 'team:manage');
    const m = await this.memberOf(a.business.id, memberId);
    if (m.user_id === userId)
      throw new ForbiddenException('You cannot remove yourself');
    this.assertAssignable(a.role, m.role);
    await this.auth.verifyPin(userId, pin);
    await this.prisma.business_members.update({
      where: { id: m.id },
      data: { is_active: false },
    });
    await this.audit(userId, 'business.member_removed', a.business.id, {
      member_id: m.id,
    });
    return { message: 'Team member removed' };
  }

  async getProfile(userId: string) {
    const a = await this.access.resolve(userId, 'profile:read');
    const b = await this.prisma.businesses.findUnique({
      where: { id: a.business.id },
      select: {
        id: true,
        legal_name: true,
        trading_name: true,
        registration_number: true,
        registration_country: true,
        business_type: true,
        sector: true,
        country: true,
        city: true,
        address: true,
        business_email: true,
        business_phone: true,
        website: true,
        description: true,
        status: true,
        approved_at: true,
      },
    });
    return {
      data: b,
      meta: { can_edit: a.role === 'owner' || a.role === 'admin' },
    };
  }

  /** Only contact/presentation fields are editable; legal fields need a new KYB review. */
  async updateProfile(userId: string, dto: ProfileDto) {
    const a = await this.access.resolve(userId, 'profile:manage');
    const data: Record<string, string> = {};
    for (const k of [
      'trading_name',
      'business_email',
      'business_phone',
      'website',
      'description',
      'address',
    ] as const) {
      if (dto[k] !== undefined) data[k] = dto[k].trim();
    }
    const b = await this.prisma.businesses.update({
      where: { id: a.business.id },
      data,
    });
    await this.audit(userId, 'business.profile_updated', a.business.id, {
      fields: Object.keys(data),
    });
    return { data: b, message: 'Profile updated' };
  }

  private assertAssignable(actor: BusinessRole, role: BusinessRole) {
    if (!assignableRoles(actor).includes(role))
      throw new ForbiddenException(`Your role cannot manage ${role} members`);
  }

  private async memberOf(businessId: string, memberId: string) {
    const m = await this.prisma.business_members.findFirst({
      where: { id: memberId, business_id: businessId, is_active: true },
    });
    if (!m) throw new NotFoundException('Team member not found');
    return m;
  }

  private async audit(
    userId: string,
    action: string,
    businessId: string,
    meta: object,
  ) {
    await this.prisma.audit_logs
      .create({
        data: {
          user_id: userId,
          action,
          entity_type: 'business',
          entity_id: businessId,
          new_values: meta,
        } as any,
      })
      .catch(() => undefined);
  }
}
