import { X402Module } from '../x402/x402.module';
import { X402FacilitatorController } from './x402-facilitator.controller';
import { AgentPaymentsModule } from '../agent-payments/agent-payments.module';
import { AgentPaymentsApiController } from './agent-payments-api.controller';
import { ProjectMarketplaceModule } from '../project-marketplace/project-marketplace.module';
import { BusinessPayoutsController } from './business-payouts.controller';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { ApiPayoutsService } from './api-payouts.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { ApiKeysService } from './api-keys.service';
import { BusinessApiKeyGuard } from './api-key-auth.guard';
import { DeveloperService } from './developer.service';
import { SandboxService } from './sandbox.service';
import { DeveloperController } from './developer.controller';
import { PublicApiController } from './public-api.controller';

@Module({
  imports: [
    AuthModule,
    BusinessOpsModule,
    WithdrawModule,
    ProjectMarketplaceModule,
    AgentPaymentsModule,
    X402Module,
  ],
  controllers: [
    DeveloperController,
    PublicApiController,
    BusinessPayoutsController,
    AgentPaymentsApiController,
    X402FacilitatorController,
  ],
  providers: [
    ApiKeysService,
    DeveloperService,
    SandboxService,
    ApiPayoutsService,
    BusinessApiKeyGuard,
  ],
})
export class BusinessApiModule {}
