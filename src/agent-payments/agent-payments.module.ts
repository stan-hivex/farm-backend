import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { AgentPaymentsService } from './agent-payments.service';
import {
  AgentPaymentsController,
  BusinessIntentsController,
} from './agent-payments.controller';

@Module({
  imports: [AuthModule, WalletsModule, BusinessOpsModule, NotificationsModule],
  controllers: [AgentPaymentsController, BusinessIntentsController],
  providers: [AgentPaymentsService, KycGuard],
  exports: [AgentPaymentsService],
})
export class AgentPaymentsModule {}
