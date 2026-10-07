import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(userId: string, subject: string, message: string) {
    const ticket = await this.prisma.support_tickets.create({
      data: {
        user_id: userId,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
        priority: 'medium',
      },
    });

    return { data: ticket, message: 'Your enquiry has been sent to support.' };
  }

  async listUserTickets(userId: string) {
    const tickets = await this.prisma.support_tickets.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        support_messages: {
          orderBy: { created_at: 'asc' },
          include: {
            users: {
              select: { id: true, first_name: true, role: true },
            },
          },
        },
      },
    });

    return { data: tickets };
  }

  async listAdminTickets(status?: string) {
    const tickets = await this.prisma.support_tickets.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: 'desc' },
      include: {
        users_support_tickets_user_idTousers: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
            email: true,
            phone: true,
          },
        },
        support_messages: {
          orderBy: { created_at: 'asc' },
          include: {
            users: {
              select: { id: true, first_name: true, role: true },
            },
          },
        },
      },
    });

    return { data: tickets };
  }

  async replyToTicket(
    ticketId: string,
    senderId: string,
    message: string,
    isAdmin: boolean,
  ) {
    const ticket = await this.prisma.support_tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, user_id: true, subject: true },
    });
    if (!ticket) throw new NotFoundException('Support enquiry not found');
    if (!isAdmin && ticket.user_id !== senderId) {
      throw new NotFoundException('Support enquiry not found');
    }

    const reply = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.support_messages.create({
        data: {
          ticket_id: ticketId,
          sender_id: senderId,
          message: message.trim(),
        },
      });

      await tx.support_tickets.update({
        where: { id: ticketId },
        data: {
          status: isAdmin ? 'answered' : 'open',
          ...(isAdmin ? { assigned_to: senderId } : {}),
          closed_at: null,
        },
      });

      return createdMessage;
    });

    return { data: reply, message: 'Reply sent.' };
  }

  async replyToTicketAsAdmin(ticketId: string, adminId: string, message: string) {
    return this.replyToTicket(ticketId, adminId, message, true);
  }

  async replyToTicketAsUser(ticketId: string, userId: string, message: string) {
    return this.replyToTicket(ticketId, userId, message, false);
  }
}
