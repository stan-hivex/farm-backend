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
) {
const userId = req.user.id;


return this.analyticsService.getUserGrowthHistory(
  userId,
  Number(days || 7),
);


}
}
