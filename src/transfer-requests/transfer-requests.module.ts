import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TransferRequestsController } from './transfer-requests.controller';
import { TransferRequestsService } from './transfer-requests.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { ExpiryTasksProcessor } from '../common/tasks/expiry-tasks.processor';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    SecurityModule,
    BullModule.registerQueue({ name: 'expiry-tasks' }),
  ],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, KycGuard, ExpiryTasksProcessor],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
