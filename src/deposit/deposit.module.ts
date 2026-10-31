import { forwardRef, Module } from '@nestjs/common';
import { DepositController } from './deposit.controller';
import { DepositService } from './deposit.service';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PaystackModule } from '../paystack/paystack.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CurrencyModule } from '../currency/currency.module';
import { NowpaymentsModule } from '../nowpayments/nowpayments.module';
import { NowpaymentsWalletController } from './deposit.controller';

@Module({
  imports: [
    forwardRef(() => IvorypayModule),
    WebsocketModule,
    forwardRef(() => PaystackModule),
    NotificationsModule,
    CurrencyModule,
    NowpaymentsModule,
  ],
  controllers: [DepositController, NowpaymentsWalletController],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}
