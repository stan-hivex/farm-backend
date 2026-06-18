import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit
{
  private logger = new Logger('PrismaService');

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    try {
      if (!process.env.DATABASE_URL) {
        this.logger.warn(
          '⚠️ DATABASE_URL environment variable is not set. Database operations will fail.',
        );
        this.logger.warn(
          'On Render.com: Connect a PostgreSQL database or set DATABASE_URL in environment variables.',
        );
        return;
      }

      await this.$connect();
      this.logger.log('✅ PostgreSQL Connected');
    } catch (error) {
      this.logger.error(
        `❌ Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.error(
        'Make sure DATABASE_URL is set and the database is accessible.',
      );
      // Don't exit - allow app to start in degraded mode for health checks
      this.logger.warn(
        'Application starting in degraded mode. Database operations will fail.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}