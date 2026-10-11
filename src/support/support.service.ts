import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from '../common/cloudinary.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly maxAttachmentBytes = 20 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private async uploadAttachment(
    ticketId: string,
    attachment?: { attachmentBase64?: string; attachmentMimeType?: string },
  ): Promise<string | null> {
    const base64 = attachment?.attachmentBase64;
    const mimeType = attachment?.attachmentMimeType;
    if (!base64 && !mimeType) return null;
    if (!base64 || !mimeType) {
      throw new BadRequestException(
        'Both attachment data and media type are required',
      );
    }

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-m4v',
    ]);
    if (!allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException('Only photos and videos are supported');
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      throw new BadRequestException('Invalid attachment data');
    }

    const bytes = Buffer.from(base64, 'base64');
    if (
      bytes.length === 0 ||
      bytes.length > this.maxAttachmentBytes ||
      bytes.toString('base64') !== base64
    ) {
      throw new BadRequestException(
        'Attachments must be smaller than 20 MB',
      );
    }

    return this.cloudinaryService.uploadSupportAttachment(
      mimeType,
      base64,
      ticketId,
    );
  }

  async createTicket(
    userId: string,
    subject: string,
    message: string,
    attachment?: { attachmentBase64?: string; attachmentMimeType?: string },
  ) {
    const normalizedMessage = message?.trim() ?? '';
    if (!normalizedMessage && !attachment?.attachmentBase64) {
      throw new BadRequestException('Add a message or attach a photo or video');
    }

    let ticket;
    if (attachment?.attachmentBase64 || attachment?.attachmentMimeType) {
      const ticketId = randomUUID();
      const attachmentUrl = await this.uploadAttachment(ticketId, attachment);
      ticket = await this.prisma.$transaction(async (tx) => {
        const createdTicket = await tx.support_tickets.create({
          data: {
            id: ticketId,
            user_id: userId,
            subject: subject.trim(),
            message: normalizedMessage || null,
            status: 'open',
            priority: 'medium',
          },
        });
        await tx.support_messages.create({
          data: {
            ticket_id: ticketId,
            sender_id: userId,
            message: null,
            attachment_url: attachmentUrl,
          },
        });
        return createdTicket;
      });
    } else {
      ticket = await this.prisma.support_tickets.create({
        data: {
          user_id: userId,
          subject: subject.trim(),
          message: normalizedMessage,
          status: 'open',
          priority: 'medium',
        },
      });
    }

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
              select: {
                id: true,
                first_name: true,
                last_name: true,
                username: true,
                role: true,
              },
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
              select: {
                id: true,
                first_name: true,
                last_name: true,
                username: true,
                role: true,
              },
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
    attachment?: { attachmentBase64?: string; attachmentMimeType?: string },
  ) {
    const ticket = await this.prisma.support_tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, user_id: true, subject: true },
    });
    if (!ticket) throw new NotFoundException('Support enquiry not found');
    if (!isAdmin && ticket.user_id !== senderId) {
      throw new NotFoundException('Support enquiry not found');
    }
    const normalizedMessage = message?.trim() ?? '';
    if (!normalizedMessage && !attachment?.attachmentBase64) {
      throw new BadRequestException('Enter a message or attach a photo or video');
    }
    const attachmentUrl = await this.uploadAttachment(ticketId, attachment);

    const reply = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.support_messages.create({
        data: {
          ticket_id: ticketId,
          sender_id: senderId,
          message: normalizedMessage || null,
          attachment_url: attachmentUrl,
        },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              username: true,
              role: true,
            },
          },
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

    if (isAdmin && ticket.user_id) {
      const responder = reply.users;
      const responderName = responder
        ? [responder.first_name, responder.last_name]
            .filter((part): part is string => Boolean(part?.trim()))
            .join(' ') || responder.username
        : null;
      try {
        await this.notificationsService.sendNotification(ticket.user_id, {
          type: 'admin',
          title: 'Support replied',
          body: `${responderName || 'Support'} replied to your support enquiry: ${ticket.subject ?? 'Support enquiry'}.`,
          entityId: ticketId,
          metadata: {
            category: 'support_reply',
            ticketId,
          },
        });
      } catch (error) {
        this.logger.error(
          `Reply saved for support ticket ${ticketId}, but notification delivery failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { data: reply, message: 'Reply sent.' };
  }

  async replyToTicketAsAdmin(
    ticketId: string,
    adminId: string,
    message: string,
    attachment?: { attachmentBase64?: string; attachmentMimeType?: string },
  ) {
    return this.replyToTicket(ticketId, adminId, message, true, attachment);
  }

  async replyToTicketAsUser(
    ticketId: string,
    userId: string,
    message: string,
    attachment?: { attachmentBase64?: string; attachmentMimeType?: string },
  ) {
    return this.replyToTicket(ticketId, userId, message, false, attachment);
  }
}
