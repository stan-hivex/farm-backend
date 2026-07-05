import {
Controller,
Get,
Query,
UseGuards,
Req,
} from '@nestjs/common';

import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('analytics')
export class AnalyticsController {
constructor(
private readonly analyticsService: AnalyticsService,
) {}

// =====================================================
// USER GROWTH HISTORY
// =====================================================

@UseGuards(JwtAuthGuard)
@Permissions('analytics:read')
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
