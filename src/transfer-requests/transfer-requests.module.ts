import { Module } from '@nestjs/common';
import { TransferRequestsController } from './transfer-requests.controller';
import { TransferRequestsService } from './transfer-requests.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [AuthModule, NotificationsModule, SecurityModule, WebsocketModule],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, KycGuard],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
