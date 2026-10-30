import { Module } from '@nestjs/common';
import { AlgorandWalletClient } from './algorand-wallet.client';
import { RateService } from './rate.service';
import { ChainWalletService } from './chain-wallet.service';
import { ChainSyncService } from './chain-sync.service';
import {
  AdminChainController,
  ChainWalletController,
} from './chain-wallet.controller';

@Module({
  controllers: [ChainWalletController, AdminChainController],
  providers: [
    ChainWalletService,
    ChainSyncService,
    AlgorandWalletClient,
    RateService,
  ],
  exports: [ChainWalletService, ChainSyncService],
})
export class ChainWalletModule {}
