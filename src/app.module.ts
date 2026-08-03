import { Module, Logger, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './common/redis.module';
import { CacheModule } from './common/cache/cache.module';
import { CacheInterceptor } from './common/interceptors/cache.interceptor';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { DepositModule } from './deposit/deposit.module';
import { WithdrawModule } from './withdraw/withdraw.module';
import { PaymentsModule } from './payments/payments.module';
import { PaystackModule } from './paystack/paystack.module';
import { IvorypayModule } from './ivorypay/ivorypay.module';
import { WebhookModule } from './webhook/webhook.module';
import { InvestmentsModule } from './investments/investments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SecurityModule } from './security/security.module';
import { KycModule } from './kyc/kyc.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { MerchantsModule } from './merchants/merchants.module';
import { SettingsModule } from './settings/settings.module';
import { StkPushModule } from './stk/stk.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { QrModule } from './qr/qr.module';
import { WebsocketModule } from './websocket/websocket.module';
import { EscrowModule } from './escrow/escrow.module';
import { TransferRequestsModule } from './transfer-requests/transfer-requests.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { ExpiryTasksService } from './common/tasks/expiry-tasks.service';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';

@Module({
  imports: [
    EncryptionModule,
    AuditModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? ['.env.production'] : ['.env.production', '.env'],
      ignoreEnvFile: false,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [
          {
            limit: Number(cfg.get<string>('RATE_LIMIT')) || 20,
            ttl: Number(cfg.get<string>('RATE_LIMIT_TTL')) || 60,
          },
        ],
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => {
        const redisUrl = cfg.get<string>('REDIS_URL');
        if (!redisUrl) {
          const logger = new Logger('AppModule');
          logger.warn(
            'REDIS_URL not configured. Bull queue processing will attempt local Redis at 127.0.0.1:6379.',
          );
        }

        return {
          redis: redisUrl ?? {
            host: '127.0.0.1',
            port: 6379,
          },
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: false,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'expiry-tasks' }),
    DatabaseModule,
    PrismaModule,
    RedisModule,
    CacheModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    DepositModule,
    WithdrawModule,
    PaymentsModule,
    PaystackModule,
    IvorypayModule,
    WebhookModule,
    NotificationsModule,
    SecurityModule,
    KycModule,
    HealthModule,
    InvestmentsModule,
    ProjectsModule,
    AnalyticsModule,
    AdminModule,
    MerchantsModule,
    SettingsModule,
    StkPushModule,
    TransactionsModule,
    BlockchainModule,
    QrModule,
    WebsocketModule,
    EscrowModule,
    TransferRequestsModule,
    PaymentRequestsModule,
  ],
  providers: [
    ExpiryTasksService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
