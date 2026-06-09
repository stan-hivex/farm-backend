import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './common/redis.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.production'],
      ignoreEnvFile: false,
    }),
    DatabaseModule,
    PrismaModule,
    RedisModule,
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
  ],
})
export class AppModule {}
