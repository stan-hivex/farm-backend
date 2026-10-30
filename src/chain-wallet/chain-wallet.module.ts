import { Module } from '@nestjs/common';
import { AlgorandWalletClient } from './algorand-wallet.client';
import { RateService } from './rate.service';
import { ChainWalletService } from './chain-wallet.service';
import {
  AdminChainController,
  ChainWalletController,
} from './chain-wallet.controller';

@Module({
  controllers: [ChainWalletController, AdminChainController],
  providers: [ChainWalletService, AlgorandWalletClient, RateService],
  exports: [ChainWalletService],
})
export class ChainWalletModule {}
