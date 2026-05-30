import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true, first_name: true, last_name: true, username: true,
        email: true, phone: true, role: true, kyc_status: true,
        phone_verified: true, email_verified: true, profile_image: true,
        bio: true, country: true, city: true, referral_code: true, created_at: true,
        wallets: { select: { wallet_address: true, balance: true, currency: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return { data: user };
  }

  async updateProfile(userId: string, dto: {
    first_name?: string; last_name?: string;
    bio?: string; country?: string; city?: string;
  }) {
    const user = await this.prisma.users.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true, first_name: true, last_name: true, username: true,
        bio: true, country: true, city: true, profile_image: true,
      },
    });
    return { data: user, message: 'Profile updated' };
  }

  async searchUsers(query: string) {
    if (!query || query.length < 2) return { data: [] };
    const users = await this.prisma.users.findMany({
      where: {
        is_deleted: false, is_active: true,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { first_name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, username: true, first_name: true, last_name: true,
        profile_image: true,
        wallets: { select: { wallet_address: true }, take: 1 },
      },
      take: 10,
    });
    return { data: users };
  }

  async getContacts(userId: string) {
    const contacts = await this.prisma.contacts.findMany({
      where: { owner_id: userId },
      include: {
        users_contacts_contact_user_idTousers: {
          select: {
            id: true, username: true, first_name: true, last_name: true,
            profile_image: true,
            wallets: { select: { wallet_address: true }, take: 1 },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return { data: contacts };
  }

  async addContact(ownerId: string, identifier: string, nickname?: string) {
    const target = await this.prisma.users.findFirst({
      where: { OR: [{ username: identifier }, { phone: identifier }], is_deleted: false },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === ownerId) throw new ConflictException('Cannot add yourself as a contact');

    const exists = await this.prisma.contacts.findFirst({
      where: { owner_id: ownerId, contact_user_id: target.id },
    });
    if (exists) throw new ConflictException('Contact already added');

    const contact = await this.prisma.contacts.create({
      data: { owner_id: ownerId, contact_user_id: target.id, nickname },
    });
    return { data: contact, message: 'Contact added' };
  }

  async removeContact(ownerId: string, contactId: string) {
    await this.prisma.contacts.deleteMany({ where: { id: contactId, owner_id: ownerId } });
    return { message: 'Contact removed' };
  }

  async getNotifications(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.notifications.findMany({
        where: { user_id: userId }, skip, take, orderBy: { created_at: 'desc' },
      }),
      this.prisma.notifications.count({ where: { user_id: userId } }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async markNotificationRead(userId: string, notifId: string) {
    await this.prisma.notifications.updateMany({
      where: { id: notifId, user_id: userId }, data: { is_read: true },
    });
    return { message: 'Notification marked as read' };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false }, data: { is_read: true },
    });
    return { message: 'All notifications marked as read' };
  }
}