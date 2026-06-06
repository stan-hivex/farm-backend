import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { AuthModule } from '../auth/auth.module';
import { KycGuard } from '../common/guards/kyc.guard';

@Module({ imports: [AuthModule], controllers: [WalletsController], providers: [WalletsService, KycGuard], exports: [WalletsService] })
export class WalletsModule {}