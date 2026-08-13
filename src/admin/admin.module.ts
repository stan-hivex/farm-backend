import { Module } from '@nestjs/common';
import { AdminController, SuperadminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({ imports: [AuthModule, EscrowModule, NotificationsModule, WithdrawModule, CurrencyModule], controllers: [AdminController, SuperadminController], providers: [AdminService] })
export class AdminModule {}