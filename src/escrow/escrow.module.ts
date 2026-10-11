import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { AuthModule } from '../auth/auth.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { PaystackModule } from '../paystack/paystack.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { TransferRequestsModule } from '../transfer-requests/transfer-requests.module';

import { ExpiryTasksProcessor } from '../common/tasks/expiry-tasks.processor';
import { WebsocketModule } from '../websocket/websocket.module';
import { CloudinaryService } from '../common/cloudinary.service';

@Module({
  imports: [
    AuthModule,
    PaystackModule,
    NotificationsModule,
    SecurityModule,
    TransferRequestsModule,
    WebsocketModule,
    BullModule.registerQueue({ name: 'expiry-tasks' }),
  ],
  controllers: [EscrowController],
  providers: [EscrowService, KycGuard, ExpiryTasksProcessor, CloudinaryService],
  exports: [EscrowService],
})
export class EscrowModule {}