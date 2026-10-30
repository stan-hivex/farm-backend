import { Module } from '@nestjs/common';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { AlgorandAsaClient } from './algorand-asa.client';
import { TokenizationService } from './tokenization.service';
import {
  AdminTokenizationController,
  TokenizationController,
} from './tokenization.controller';

@Module({
  imports: [BusinessOpsModule],
  controllers: [TokenizationController, AdminTokenizationController],
  providers: [TokenizationService, AlgorandAsaClient],
})
export class TokenizationModule {}
