import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PaymentsModule } from '../payments/payments.module';
import { MerchantCheckoutController } from './merchant-checkout.controller';
import { DepositModule } from '../deposit/deposit.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    SecurityModule,
    WebsocketModule,
    PaymentsModule,
    DepositModule,
  ],
  controllers: [QrController, MerchantCheckoutController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}