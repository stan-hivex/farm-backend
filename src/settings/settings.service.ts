import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SettingsService {

  constructor(
    private prisma: PrismaService,
  ) {}

  async updateLanguage(
    userId: string,
    language: string,
  ) {

    await this.prisma.user_settings.upsert({

      where: {
        user_id: userId,
      },

      update: {
        language,
      },

      create: {
        user_id: userId,
        language,
      },
    });

    return {
      success: true,
      message: 'Language updated successfully',
    };
  }

  async updateTheme(
    userId: string,
    theme: string,
  ) {
    // Accept 'light', 'dark', or 'system'
    const val = (theme || '').toLowerCase();
    const allowed = ['light', 'dark', 'system'];
    const themeValue = allowed.includes(val) ? val : 'system';

    await this.prisma.user_settings.upsert({
      where: { user_id: userId },
      update: { theme: themeValue },
      create: { user_id: userId, theme: themeValue },
    });

    return {
      success: true,
      message: 'Theme updated successfully',
    };
  }

  async getNotificationSettings(userId: string) {
    const settings = await this.prisma.user_settings.findUnique({
      where: { user_id: userId },
    });

    return {
      success: true,
      data: settings,
    };
  }

  async updateNotificationSettings(userId: string, body: {
    push_notifications: boolean;
    email_notifications: boolean;
    in_app_notifications: boolean;
    sms_notifications: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
  }) {
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
}