import { Module } from '@nestjs/common';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { KycGuard } from '../common/guards/kyc.guard';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
  ],
  controllers: [WithdrawController],
  providers: [WithdrawService, KycGuard],
  exports: [WithdrawService],
})
export class WithdrawModule {}