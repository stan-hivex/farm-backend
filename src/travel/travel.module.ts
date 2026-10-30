import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateService } from '../chain-wallet/rate.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { DuffelProvider } from './duffel.provider';
import { AdminTravelController, TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TravelController, AdminTravelController],
  providers: [
    RateService,
    KycGuard,
    { provide: DuffelProvider, useFactory: () => new DuffelProvider(process.env) },
    TravelService,
  ],
  exports: [TravelService],
})
export class TravelModule {}
