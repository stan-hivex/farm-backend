import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateService } from '../chain-wallet/rate.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { DuffelProvider } from './duffel.provider';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  imports: [AuthModule],
  controllers: [TravelController],
  providers: [
    RateService,
    KycGuard,
    { provide: DuffelProvider, useFactory: () => new DuffelProvider(process.env) },
    TravelService,
  ],
  exports: [TravelService],
})
export class TravelModule {}
