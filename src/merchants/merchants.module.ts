import { Module } from '@nestjs/common';
import {
  MerchantsController,
  PublicMerchantsController,
} from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { QrModule } from '../qr/qr.module';
import { QrPaymentsModule } from '../qr-payments/qr-payments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QrModule, QrPaymentsModule, AuthModule],
  controllers: [MerchantsController, PublicMerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}