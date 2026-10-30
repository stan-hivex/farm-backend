import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateService } from '../chain-wallet/rate.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { DuffelProvider } from './duffel.provider';
import { PkfareProvider } from './pkfare.provider';
import { LiteApiProvider } from './liteapi.provider';
import { HotelsService } from './hotels.service';
import { FLIGHT_PROVIDER, HOTEL_PROVIDER } from './travel-provider';

/** TRAVEL_FLIGHT_PROVIDER=duffel (default) | pkfare */
export function selectFlightProvider(env: NodeJS.ProcessEnv) {
  return (env.TRAVEL_FLIGHT_PROVIDER ?? 'duffel').toLowerCase() === 'pkfare' ? new PkfareProvider(env) : new DuffelProvider(env);
}
import { AdminTravelController, TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TravelController, AdminTravelController],
  providers: [
    RateService,
    KycGuard,
    { provide: FLIGHT_PROVIDER, useFactory: () => selectFlightProvider(process.env) },
    { provide: HOTEL_PROVIDER, useFactory: () => new LiteApiProvider(process.env) },
    TravelService,
    HotelsService,
  ],
  exports: [TravelService],
})
export class TravelModule {}
