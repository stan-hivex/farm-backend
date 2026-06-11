import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';
import { PaymentProcessor } from './payment.processor';
import { DepositModule } from '../deposit/deposit.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaystackModule } from '../paystack/paystack.module';
import { PrismaService } from '../database/prisma.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { QUEUES } from '../common/constants';

@Module({
  imports: [
    forwardRef(() => DepositModule),
    forwardRef(() => WithdrawModule),
    WebsocketModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => PaystackModule),
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: QUEUES.WEBHOOKS,
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookProcessor,
    PaymentProcessor,
    PrismaService,
    WebhookSignatureGuard,
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
