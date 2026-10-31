import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { AlgorandAsaClient } from './algorand-asa.client';
import { TokenizationService } from './tokenization.service';
import {
  AdminTokenizationController,
  TokenizationController,
} from './tokenization.controller';

@Module({
  imports: [AuthModule, BusinessOpsModule],
  controllers: [TokenizationController, AdminTokenizationController],
  providers: [TokenizationService, AlgorandAsaClient],
})
export class TokenizationModule {}
