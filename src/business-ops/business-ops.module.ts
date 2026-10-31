import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';
import { EscrowModule } from '../escrow/escrow.module';
import { BusinessAccessService } from './business-access.service';
import { BusinessTeamService } from './business-team.service';
import { BusinessFinanceService } from './business-finance.service';
import { BusinessCommerceService } from './business-commerce.service';
import { BusinessEscrowService } from './business-escrow.service';
import { BusinessWebhooksService } from './business-webhooks.service';
import {
  BusinessOpsController,
  BusinessPayController,
} from './business-ops.controller';

@Module({
  imports: [AuthModule, WalletsModule, EscrowModule],
  controllers: [BusinessOpsController, BusinessPayController],
  providers: [
    BusinessAccessService,
    BusinessTeamService,
    BusinessFinanceService,
    BusinessCommerceService,
    BusinessEscrowService,
    BusinessWebhooksService,
  ],
  exports: [
    BusinessAccessService,
    BusinessFinanceService,
    BusinessCommerceService,
    BusinessEscrowService,
    BusinessWebhooksService,
  ],
})
export class BusinessOpsModule {}
