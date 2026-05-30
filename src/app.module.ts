import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import Redis from 'ioredis';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { EscrowModule } from './escrow/escrow.module';
import { QrModule } from './qr/qr.module';
import { MerchantsModule } from './merchants/merchants.module';
import { InvestmentsModule } from './investments/investments.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { KycModule } from './kyc/kyc.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { WebsocketModule } from './websocket/websocket.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';
import { AuditMiddleware } from './common/middleware/audit.middleware';
import { SettingsModule } from './settings/settings.module';
import { DepositModule } from './deposit/deposit.module';
import { PaystackModule } from './paystack/paystack.module';
import { WithdrawModule } from './withdraw/withdraw.module';
import { WebhookModule } from './webhook/webhook.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? undefined : ['.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ([{
        ttl: cfg.get<number>('RATE_LIMIT_TTL', 60000),
        limit: cfg.get<number>('RATE_LIMIT_MAX', 100),
      }]),
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        redis: {
          host: cfg.get<string>('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get<string>('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500, attempts: 3 },
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    TransactionsModule,
    EscrowModule,
    QrModule,
    MerchantsModule,
    InvestmentsModule,
    BlockchainModule,
    PaymentsModule,
    NotificationsModule,
    KycModule,
    AdminModule,
    AnalyticsModule,
    HealthModule,
    WebsocketModule,
    SettingsModule,
    DepositModule,
    PaystackModule,
    WithdrawModule,
    WebhookModule,
  ],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) =>
        new Redis({
          host: cfg.get<string>('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get<string>('REDIS_PASSWORD') || undefined,
        }),
      inject: [ConfigService],
    },
    IdempotencyMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      // Request ID on every route
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    consumer
      // Idempotency on POST financial routes
      .apply(IdempotencyMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.POST });

    consumer
      // Auto-audit on admin, kyc, and payment routes
      .apply(AuditMiddleware)
      .forRoutes(
        { path: 'admin/*', method: RequestMethod.ALL },
        { path: 'kyc/*', method: RequestMethod.ALL },
        { path: 'payments/*', method: RequestMethod.ALL },
        { path: 'deposit/*', method: RequestMethod.ALL },
        { path: 'paystack/*', method: RequestMethod.ALL },
        { path: 'withdraw/*', method: RequestMethod.ALL },
        { path: 'webhooks/*', method: RequestMethod.ALL },
      );
  }
}