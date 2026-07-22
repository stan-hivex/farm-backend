import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { type notification_type } from '@prisma/client';
import { paginationParams, paginate } from '../common/utils/pagination.util';
import * as fs from 'fs';
import * as nodemailer from 'nodemailer';
import Twilio from 'twilio';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailer: nodemailer.Transporter;
  private twilioClient: any;
  private fcmInitialized = false;

  constructor(private prisma: PrismaService, private cfg: ConfigService) {
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

    // Initialize Firebase Admin SDK if service account provided
    const fbServiceAccount = cfg.get<string>('FIREBASE_SERVICE_ACCOUNT');
    const fbCredPath = cfg.get<string>('FIREBASE_CREDENTIALS_PATH');
    if (fbServiceAccount || fbCredPath) {
      try {
        if (admin.apps.length > 0) {
          this.fcmInitialized = true;
        } else if (fbServiceAccount) {
          const parsed = JSON.parse(fbServiceAccount);
          admin.initializeApp({ credential: admin.credential.cert(parsed as any) });
        } else {
          const serviceAccount = JSON.parse(fs.readFileSync(fbCredPath!, 'utf8'));
          admin.initializeApp({ credential: admin.credential.cert(serviceAccount as any) });
        }
        this.fcmInitialized = true;
        this.logger.log('Firebase Admin initialized for FCM');
      } catch (e) {
        this.logger.error('Failed to initialize Firebase Admin: ' + e);
      }
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

  async createInApp(userId: string, dto: {
    type: notification_type | string; title: string; body: string; metadata?: any; entityId?: string;
  }) {
    return this.prisma.notifications.create({
      data: {
        user_id: userId,
        type: dto.type as notification_type,
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
    if (!this.fcmInitialized) {
      this.logger.debug('FCM not configured; skipping push send');
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
      const payload: admin.messaging.MulticastMessage = {
        notification: { title, body },
        data: payloadData,
        tokens,
      };
      const resp = await admin.messaging().sendEachForMulticast(payload);
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
    await Promise.all([
      this.sendNotification(senderId, {
        type: 'transfer_sent', entityId: reference, title: 'Transfer Successful',
        body: `You sent ${amount} FARM.`,
      }),
      this.sendNotification(receiverId, {
        type: 'transfer_received', entityId: reference, title: 'Money Received',
        body: `You received ${amount} FARM.`,
      }),
    ]);
  }

  async sendNotification(userId: string, dto: {
    type: notification_type | string;
    title: string;
    body: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }) {
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