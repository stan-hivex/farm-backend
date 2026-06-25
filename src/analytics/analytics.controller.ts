import {
Controller,
Get,
Query,
UseGuards,
Req,
} from '@nestjs/common';

import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analytics')
export class AnalyticsController {
constructor(
private readonly analyticsService: AnalyticsService,
) {}

// =====================================================
// USER GROWTH HISTORY
// =====================================================

@UseGuards(JwtAuthGuard)
@Get('growth-history')
async getGrowthHistory(
  @Req() req,
  @Query('days') days?: string,
  @Query('period') period?: string,
) {
  const userId = req.user.id;
  const normalizedPeriod = period?.toString().trim().toLowerCase();

  return this.analyticsService.getUserGrowthHistory(
    userId,
    Number(days || 7),
    normalizedPeriod,
  );
}
}
