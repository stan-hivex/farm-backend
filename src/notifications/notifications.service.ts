import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { type notification_type } from '@prisma/client';
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
        if (fbServiceAccount) {
          const parsed = JSON.parse(fbServiceAccount);
          admin.initializeApp({ credential: admin.credential.cert(parsed as any) });
        } else {
          admin.initializeApp({ credential: admin.credential.applicationDefault() });
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
    await (this.prisma as any).device_tokens.upsert({
      where: { token },
      create: { user_id: userId, token, platform, is_active: true, last_seen: new Date() },
      update: { user_id: userId, platform, is_active: true, last_seen: new Date() },
    });
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
    const settings = await this.prisma.user_settings.findUnique({
      where: { user_id: userId },
    });

    return {
      success: true,
      data: settings,
    };
  }

  async updateSettings(userId: string, body: any) {
    const settings = await this.prisma.user_settings.upsert({
      where: { user_id: userId },
      update: {
        push_notifications: body.push_notifications,
        email_notifications: body.email_notifications,
        in_app_notifications: body.in_app_notifications,
        sms_notifications: body.sms_notifications,
        sound_enabled: body.sound_enabled,
        vibration_enabled: body.vibration_enabled,
      },
      create: {
        user_id: userId,
        push_notifications: body.push_notifications,
        email_notifications: body.email_notifications,
        in_app_notifications: body.in_app_notifications,
        sms_notifications: body.sms_notifications,
        sound_enabled: body.sound_enabled,
        vibration_enabled: body.vibration_enabled,
      },
    });

    return {
      success: true,
      data: settings,
    };
  }

  async createInApp(userId: string, dto: {
    type: notification_type | string; title: string; body: string; metadata?: any;
  }) {
    const settings = await this.prisma.user_settings.findUnique({
      where: { user_id: userId },
    });

    if (settings?.in_app_notifications === false) {
      this.logger.debug(`In-app notifications disabled for user ${userId}. Skipping create.`);
      return null;
    }

    return this.prisma.notifications.create({
      data: {
        user_id: userId,
        type: dto.type as notification_type,
        title: dto.title,
        body: dto.body,
        metadata: dto.metadata,
      },
    });
  }

  async getUserSettings(userId: string) {
    return this.prisma.user_settings.findUnique({ where: { user_id: userId } });
  }

  async sendEmailToUser(userId: string, subject: string, html: string) {
    const settings = await this.getUserSettings(userId);
    if (settings?.email_notifications === false) {
      this.logger.debug(`Email notifications disabled for user ${userId}. Skipping email send.`);
      return false;
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user?.email) {
      this.logger.debug(`No email address for user ${userId}. Skipping email send.`);
      return false;
    }

    return this.sendEmail(user.email, subject, html);
  }

  async sendSmsToUser(userId: string, message: string) {
    const settings = await this.getUserSettings(userId);
    if (settings?.sms_notifications === false) {
      this.logger.debug(`SMS notifications disabled for user ${userId}. Skipping SMS send.`);
      return false;
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user?.phone) {
      this.logger.debug(`No phone number for user ${userId}. Skipping SMS send.`);
      return false;
    }

    return this.sendSms(user.phone, message);
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

    const settings = await this.prisma.user_settings.findUnique({
      where: { user_id: userId },
    });
    if (settings?.push_notifications === false) {
      this.logger.debug(`Push notifications disabled for user ${userId}. Skipping FCM send.`);
      return false;
    }

    try {
      const tokens = await this.getDeviceTokens(userId);
      if (!tokens || tokens.length === 0) return false;
      const payload: admin.messaging.MulticastMessage = {
        notification: { title, body },
        data: data as any,
        tokens,
      };
      const resp = await (admin.messaging() as any).sendMulticast(payload);
      this.logger.debug(`FCM sent: success=${resp.successCount} failure=${resp.failureCount}`);
      return resp.successCount > 0;
    } catch (e) {
      this.logger.error('FCM send failed: ' + e);
      return false;
    }
  }

  async notifyTransfer(senderId: string, receiverId: string, amount: number, reference: string) {
    await Promise.all([
      this.createInApp(senderId, {
        type: 'transaction', title: 'Transfer Sent',
        body: `You sent ${amount} FARM (Ref: ${reference})`,
      }),
      this.createInApp(receiverId, {
        type: 'transaction', title: 'Transfer Received',
        body: `You received ${amount} FARM (Ref: ${reference})`,
      }),
    ]);
  }
}