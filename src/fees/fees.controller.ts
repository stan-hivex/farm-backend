import { Controller, Get, Query } from '@nestjs/common';
import { FeesService } from './fees.service';

/** Public, read-only fee schedule so apps never hardcode rates. */
@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  schedule() {
    return this.fees.publicSchedule();
  }

  @Get('quote')
  quote(@Query('type') type: string, @Query('amount') amount: string) {
    return this.fees.quote(type, Number(amount));
  }
}
