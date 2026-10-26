import { Module } from '@nestjs/common';
import { CurrencyModule } from '../currency/currency.module';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaystackModule } from '../paystack/paystack.module';
import { PrismaModule } from '../database/prisma.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { NowpaymentsModule } from '../nowpayments/nowpayments.module';
import { QrPaymentsController } from './qr-payments.controller';
import { QrPaymentsService } from './qr-payments.service';

@Module({
  imports: [
    PrismaModule,
    CurrencyModule,
    PaystackModule,
    IvorypayModule,
    NotificationsModule,
    WebsocketModule,
    ReceiptsModule,
    NowpaymentsModule,
  ],
  controllers: [QrPaymentsController],
  providers: [QrPaymentsService],
  exports: [QrPaymentsService],
})
export class QrPaymentsModule {}
