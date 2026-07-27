import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { KycGuard } from '../common/guards/kyc.guard';

@Module({ imports: [AuthModule, NotificationsModule], controllers: [WalletsController], providers: [WalletsService, KycGuard], exports: [WalletsService] })
export class WalletsModule {}