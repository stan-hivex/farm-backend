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
}