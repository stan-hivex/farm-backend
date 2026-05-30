import { Module } from '@nestjs/common';
import { AlgorandService } from './algorand.service';

@Module({ providers: [AlgorandService], exports: [AlgorandService] })
export class BlockchainModule {}