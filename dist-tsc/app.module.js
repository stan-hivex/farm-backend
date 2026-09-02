"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bull_1 = require("@nestjs/bull");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const database_module_1 = require("./database/database.module");
const prisma_module_1 = require("./database/prisma.module");
const redis_module_1 = require("./common/redis/redis.module");
const cache_module_1 = require("./common/cache/cache.module");
const cache_interceptor_1 = require("./common/interceptors/cache.interceptor");
const encryption_module_1 = require("./common/encryption/encryption.module");
const audit_module_1 = require("./common/audit/audit.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const wallets_module_1 = require("./wallets/wallets.module");
const deposit_module_1 = require("./deposit/deposit.module");
const withdraw_module_1 = require("./withdraw/withdraw.module");
const payments_module_1 = require("./payments/payments.module");
const paystack_module_1 = require("./paystack/paystack.module");
const ivorypay_module_1 = require("./ivorypay/ivorypay.module");
const webhook_module_1 = require("./webhook/webhook.module");
const investments_module_1 = require("./investments/investments.module");
const notifications_module_1 = require("./notifications/notifications.module");
const security_module_1 = require("./security/security.module");
const kyc_module_1 = require("./kyc/kyc.module");
const health_module_1 = require("./health/health.module");
const projects_module_1 = require("./projects/projects.module");
const analytics_module_1 = require("./analytics/analytics.module");
const admin_module_1 = require("./admin/admin.module");
const merchants_module_1 = require("./merchants/merchants.module");
const settings_module_1 = require("./settings/settings.module");
const stk_module_1 = require("./stk/stk.module");
const transactions_module_1 = require("./transactions/transactions.module");
const blockchain_module_1 = require("./blockchain/blockchain.module");
const qr_module_1 = require("./qr/qr.module");
const websocket_module_1 = require("./websocket/websocket.module");
const escrow_module_1 = require("./escrow/escrow.module");
const transfer_requests_module_1 = require("./transfer-requests/transfer-requests.module");
const payment_requests_module_1 = require("./payment-requests/payment-requests.module");
const expiry_tasks_service_1 = require("./common/tasks/expiry-tasks.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            encryption_module_1.EncryptionModule,
            audit_module_1.AuditModule,
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: process.env.NODE_ENV === 'production' ? ['.env.production'] : ['.env.production', '.env'],
                ignoreEnvFile: false,
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (cfg) => ({
                    throttlers: [
                        {
                            limit: Number(cfg.get('RATE_LIMIT')) || 20,
                            ttl: Number(cfg.get('RATE_LIMIT_TTL')) || 60,
                        },
                    ],
                }),
            }),
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: async (cfg) => {
                    const redisUrl = cfg.get('REDIS_URL');
                    if (!redisUrl) {
                        const logger = new common_1.Logger('AppModule');
                        logger.warn('REDIS_URL not configured. Bull queue processing will attempt local Redis at 127.0.0.1:6379.');
                    }
                    return {
                        redis: redisUrl ?? {
                            host: '127.0.0.1',
                            port: 6379,
                        },
                        defaultJobOptions: {
                            removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
                            removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
                        },
                    };
                },
            }),
            bull_1.BullModule.registerQueue({ name: 'expiry-tasks' }),
            database_module_1.DatabaseModule,
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            cache_module_1.CacheModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            wallets_module_1.WalletsModule,
            deposit_module_1.DepositModule,
            withdraw_module_1.WithdrawModule,
            payments_module_1.PaymentsModule,
            paystack_module_1.PaystackModule,
            ivorypay_module_1.IvorypayModule,
            webhook_module_1.WebhookModule,
            notifications_module_1.NotificationsModule,
            security_module_1.SecurityModule,
            kyc_module_1.KycModule,
            health_module_1.HealthModule,
            investments_module_1.InvestmentsModule,
            projects_module_1.ProjectsModule,
            analytics_module_1.AnalyticsModule,
            admin_module_1.AdminModule,
            merchants_module_1.MerchantsModule,
            settings_module_1.SettingsModule,
            stk_module_1.StkPushModule,
            transactions_module_1.TransactionsModule,
            blockchain_module_1.BlockchainModule,
            qr_module_1.QrModule,
            websocket_module_1.WebsocketModule,
            escrow_module_1.EscrowModule,
            transfer_requests_module_1.TransferRequestsModule,
            payment_requests_module_1.PaymentRequestsModule,
        ],
        providers: [
            expiry_tasks_service_1.ExpiryTasksService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: cache_interceptor_1.CacheInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map