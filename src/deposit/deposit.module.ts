import { forwardRef, Module } from '@nestjs/common';
import { DepositController } from './deposit.controller';
import { DepositService } from './deposit.service';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PaystackModule } from '../paystack/paystack.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => IvorypayModule), WebsocketModule, forwardRef(() => PaystackModule), NotificationsModule],
  controllers: [DepositController],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}