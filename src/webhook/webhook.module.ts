import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { DepositModule } from '../deposit/deposit.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PrismaService } from '../database/prisma.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { QUEUES } from '../common/constants';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

function getRequiredString(cfg: ConfigService, key: string): string {
  const value = cfg.get<string>(key);
  if (!value) {
    throw new Error(`${key} is required but was not found in configuration`);
  }
  return value;
}

function getOptionalString(cfg: ConfigService, key: string): string | undefined {
  return cfg.get<string>(key) ?? undefined;
}

@Module({
  imports: [
    forwardRef(() => DepositModule),
    WithdrawModule,
    WebsocketModule,
    BullModule.registerQueue({
      name: QUEUES.WEBHOOKS,
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    PrismaService,
    WebhookSignatureGuard,

    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) => {
        const url = getOptionalString(cfg, 'REDIS_URL');
        return url ? new Redis(url) : null;
      },
      inject: [ConfigService],
    },
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
