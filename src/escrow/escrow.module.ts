import { Module } from '@nestjs/common';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { AuthModule } from '../auth/auth.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { PaystackModule } from '../paystack/paystack.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, PaystackModule, NotificationsModule],
  controllers: [EscrowController],
  providers: [EscrowService, KycGuard],
  exports: [EscrowService],
})
export class EscrowModule {}