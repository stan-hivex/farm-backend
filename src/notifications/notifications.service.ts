import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { type notification_type } from '@prisma/client';
import { paginationParams, paginate } from '../common/utils/pagination.util';
import * as nodemailer from 'nodemailer';
import Twilio from 'twilio';
import { FirebaseService } from './firebase.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailer: nodemailer.Transporter;
  private twilioClient: any;

  constructor(private prisma: PrismaService, private cfg: ConfigService, private firebase: FirebaseService) {
    this.mailer = nodemailer.createTransport({
      host: cfg.get('SMTP_HOST'),
      port: cfg.get<number>('SMTP_PORT', 587),
      auth: { user: cfg.get('SMTP_USER'), pass: cfg.get('SMTP_PASS') },
    });

    const sid = cfg.get<string>('TWILIO_ACCOUNT_SID');
    const token = cfg.get<string>('TWILIO_AUTH_TOKEN');
    if (sid && token) {
      try {
        this.twilioClient = Twilio(sid, token);
        this.logger.log('Twilio SMS client initialized');
      } catch (e) {
        this.logger.error('Failed to initialize Twilio client: ' + e);
      }
    }

    // Firebase Admin is initialized by FirebaseService; ensure messaging is available
    if (this.firebase) {
      this.logger.log('FirebaseService provided for FCM');
    }
  }

  async getDeviceTokens(userId: string) {
    const tokens = await (this.prisma as any).device_tokens.findMany({ where: { user_id: userId, is_active: true } });
    return tokens.map((t) => t.token);
  }

  async registerDeviceToken(userId: string, token: string, platform?: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) throw new Error('Device token is required');

    const existing = await (this.prisma as any).device_tokens.findFirst({
      where: { token: normalizedToken },
    });

    if (existing) {
      await (this.prisma as any).device_tokens.update({
        where: { id: existing.id },
        data: {
          user_id: userId,
          platform: platform || existing.platform,
          is_active: true,
          last_seen: new Date(),
        },
      });
    } else {
      await (this.prisma as any).device_tokens.create({
        data: {
          user_id: userId,
          token: normalizedToken,
          platform: platform || 'unknown',
          is_active: true,
          last_seen: new Date(),
        },
      });
    }
    return { success: true };
  }

  async removeDeviceToken(userId: string, token: string) {
    await (this.prisma as any).device_tokens.updateMany({
      where: { user_id: userId, token },
      data: { is_active: false },
    });
    return { success: true };
  }

  async getSettings(userId: string) {

  const settings =
    await this.prisma.user_settings.findUnique({
      where: {
        user_id: userId,
      },
    });

  return {
    success: true,
    data: settings,
  };
}

async updateSettings(userId: string, body: any) {

  const settings =
    await this.prisma.user_settings.upsert({

      where: {
        user_id: userId,
      },

      update: {
        push_notifications:
          body.push_notifications,

        email_notifications:
          body.email_notifications,

        sms_notifications:
          body.sms_notifications,

        sound_enabled:
          body.sound_enabled,

        vibration_enabled:
          body.vibration_enabled,
      },

      create: {

        user_id: userId,

        push_notifications:
          body.push_notifications,

        email_notifications:
          body.email_notifications,

        sms_notifications:
          body.sms_notifications,

        sound_enabled:
          body.sound_enabled,

        vibration_enabled:
          body.vibration_enabled,
      },
    });

  return {
    success: true,
    data: settings,
  };
}

  private normalizeNotificationType(type: string | notification_type | undefined): notification_type {
    const validTypes = new Set<notification_type>([
      'system', 'admin', 'transaction', 'transfer_received', 'transfer_sent', 'payment_request',
      'request_completed', 'request_declined', 'deposit_completed', 'withdrawal_completed', 'merchant',
      'system_announcement', 'kyc_update', 'security', 'escrow', 'investment', 'transfer_request',
    ]);
    const normalized = type?.toString().trim().toLowerCase();
    if (!normalized) return 'system';
    if (validTypes.has(normalized as notification_type)) return normalized as notification_type;
    if (normalized.startsWith('merchant_payment')) return 'merchant';
    return 'system';
  }

  async createInApp(userId: string, dto: {
    type: notification_type | string; title: string; body: string; metadata?: any; entityId?: string;
  }) {
    const type = this.normalizeNotificationType(dto.type);
    return this.prisma.notifications.create({
      data: {
        user_id: userId,
        type,
        title: dto.title,
        body: dto.body,
        metadata: {
          ...(dto.metadata ?? {}),
          type: dto.type,
          entityId: dto.entityId,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  async getNotifications(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.notifications.findMany({
        where: { user_id: userId },
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.notifications.count({ where: { user_id: userId } }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notifications.updateMany({
      where: { id, user_id: userId },
      data: { is_read: true },
    });
    return { message: 'Notification marked as read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { message: 'All notifications marked as read' };
  }

  async deleteNotification(userId: string, id: string) {
    await this.prisma.notifications.deleteMany({
      where: { id, user_id: userId },
    });
    return { message: 'Notification deleted' };
  }

  async deleteAllNotifications(userId: string) {
    await this.prisma.notifications.deleteMany({
      where: { user_id: userId },
    });
    return { message: 'All notifications deleted' };
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await this.mailer.sendMail({ from: this.cfg.get('SMTP_FROM'), to, subject, html });
    } catch (e) {
      this.logger.error(`Email failed to ${to}: ${e}`);
    }
  }

  async sendSms(phone: string, message: string) {
    // Avoid logging message contents (OTP) to stdout.
    if (this.twilioClient) {
      try {
        const from = this.cfg.get<string>('TWILIO_SENDER') || this.cfg.get<string>('TWILIO_FROM');
        await this.twilioClient.messages.create({ body: message, from, to: phone });
        this.logger.debug(`[SMS → ${phone}]: sent`);
        return true;
      } catch (e) {
        this.logger.error(`Twilio SMS failed to ${phone}: ${e}`);
        return false;
      }
    }

    // No provider configured: fall back to debug-only (without revealing message contents)
    this.logger.debug(`[SMS → ${phone}]: provider not configured, skip send`);
    return false;
  }

  async sendPush(userId: string, title: string, body: string, data?: Record<string, any>) {
    if (!this.firebase) {
      this.logger.debug('FirebaseService not available; skipping push send');
      return false;
    }
    try {
      const tokens = await this.getDeviceTokens(userId);
      if (!tokens || tokens.length === 0) return false;
      const timestamp = new Date().toISOString();
      const payloadData: Record<string, string> = Object.fromEntries(
        Object.entries({ ...data, title, body, timestamp }).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      );
      const payload: any = {
        notification: { title, body },
        data: payloadData,
        tokens,
      };
      if (!this.firebase || !this.firebase.messaging) {
        this.logger.warn('Firebase messaging not initialized; skipping push send');
        return false;
      }
      const messaging = (this.firebase as any).messaging;
      const resp = await messaging.sendEachForMulticast(payload as any);
      const invalidTokens = resp.responses
        .map((result, index) => ({ result, token: tokens[index] }))
        .filter(({ result }) => {
          const code = result.error?.code;
          return code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token';
        })
        .map(({ token }) => token);
      if (invalidTokens.length > 0) {
        await (this.prisma as any).device_tokens.updateMany({
          where: { token: { in: invalidTokens } },
          data: { is_active: false },
        });
      }
      this.logger.debug(`FCM sent: success=${resp.successCount} failure=${resp.failureCount}`);
      return resp.successCount > 0;
    } catch (e) {
      this.logger.error('FCM send failed: ' + e);
      return false;
    }
  }

  async notifyTransfer(senderId: string, receiverId: string, amount: number, reference: string) {
    const [sender, receiver, receiverWallet] = await Promise.all([
      (this.prisma as any).users.findUnique({ where: { id: senderId }, select: { first_name: true, last_name: true, username: true } }),
      (this.prisma as any).users.findUnique({ where: { id: receiverId }, select: { first_name: true, last_name: true, username: true } }),
      (this.prisma as any).wallets.findFirst({ where: { user_id: receiverId }, select: { balance: true } }),
    ]);

    const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || sender?.username || 'Someone';
    const receiverName = [receiver?.first_name, receiver?.last_name].filter(Boolean).join(' ').trim() || receiver?.username || 'you';
    const balance = receiverWallet ? Number(receiverWallet.balance ?? 0) : 0;

    await Promise.all([
      this.sendNotification(senderId, {
        type: 'transfer_sent', entityId: reference, title: '✅ Transfer Sent',
        body: `You sent ${amount} FARM to ${receiverName}.`,
      }),
      this.sendNotification(receiverId, {
        type: 'transfer_received', entityId: reference, title: '💰 Money Received',
        body: `${senderName} sent you ${amount} FARM. Your balance is ${balance} FARM. Tap to view.`,
      }),
    ]);
  }

  async sendNotification(userId: string | null, dto: {
    type: notification_type | string;
    title: string;
    body: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }) {
    if (!userId) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const metadata = {
      ...(dto.metadata ?? {}),
      type: dto.type,
      entityId: dto.entityId ?? '',
      timestamp,
    };
    const notification = await this.createInApp(userId, {
      ...dto,
      metadata,
    });
    await this.sendPush(userId, dto.title, dto.body, {
      type: dto.type,
      entityId: dto.entityId ?? '',
      timestamp,
      notificationId: notification.id,
    });
    return notification;
  }
}