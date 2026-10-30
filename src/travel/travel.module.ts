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

/**
 * TRAVEL_FLIGHT_PROVIDER (or FLIGHT_PROVIDER) = pkfare (default) | duffel (optional legacy adapter).
 * Without credentials the provider reports isConfigured() = false and flights stay off.
 */
export function selectFlightProvider(env: NodeJS.ProcessEnv) {
  const name = (
    env.TRAVEL_FLIGHT_PROVIDER ??
    env.FLIGHT_PROVIDER ??
    'pkfare'
  ).toLowerCase();
  return name === 'duffel' ? new DuffelProvider(env) : new PkfareProvider(env);
}
import { AdminTravelController, TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TravelController, AdminTravelController],
  providers: [
    RateService,
    KycGuard,
    {
      provide: FLIGHT_PROVIDER,
      useFactory: () => selectFlightProvider(process.env),
    },
    {
      provide: HOTEL_PROVIDER,
      useFactory: () => new LiteApiProvider(process.env),
    },
    TravelService,
    HotelsService,
  ],
  exports: [TravelService, HotelsService],
})
export class TravelModule {}
