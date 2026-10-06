import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, WebsocketModule],
  providers: [PaymentRequestsService],
  controllers: [PaymentRequestsController],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
