import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { QrModule } from '../qr/qr.module';

@Module({ imports: [QrModule], controllers: [MerchantsController], providers: [MerchantsService], exports: [MerchantsService] })
export class MerchantsModule {}