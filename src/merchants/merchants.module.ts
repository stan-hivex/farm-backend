import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { QrModule } from '../qr/qr.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QrModule, AuthModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}