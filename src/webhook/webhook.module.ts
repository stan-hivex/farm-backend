import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';
import { DepositModule } from '../deposit/deposit.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PrismaService } from '../database/prisma.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { QUEUES } from '../common/constants';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Module({
  imports: [
    forwardRef(() => DepositModule),
    WithdrawModule,
    WebsocketModule,
    BullModule.registerQueue({ name: QUEUES.WEBHOOKS }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    PrismaService,
    WebhookSignatureGuard,
    WebhookProcessor,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) =>
       new Redis(cfg.get<string>('REDIS_URL')),
      inject: [ConfigService],
    },
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
