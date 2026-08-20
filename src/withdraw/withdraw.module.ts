import { forwardRef, Module } from '@nestjs/common';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaystackModule } from '../paystack/paystack.module';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    forwardRef(() => PaystackModule),
    NotificationsModule,
    IvorypayModule,
    SecurityModule,
    CurrencyModule,
  ],
  controllers: [WithdrawController],
  providers: [WithdrawService, KycGuard],
  exports: [WithdrawService],
})
export class WithdrawModule {}