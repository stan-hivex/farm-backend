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
}