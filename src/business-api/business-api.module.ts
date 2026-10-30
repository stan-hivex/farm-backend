import { ProjectMarketplaceModule } from '../project-marketplace/project-marketplace.module';
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
  imports: [AuthModule, BusinessOpsModule, WithdrawModule, ProjectMarketplaceModule],
  controllers: [DeveloperController, PublicApiController],
  providers: [
    ApiKeysService,
    DeveloperService,
    SandboxService,
    ApiPayoutsService,
    BusinessApiKeyGuard,
  ],
})
export class BusinessApiModule {}
