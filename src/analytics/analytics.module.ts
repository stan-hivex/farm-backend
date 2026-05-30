import { Module } from '@nestjs/common';

import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

import { DatabaseModule } from '../database/database.module';

@Module({
imports: [DatabaseModule],
providers: [AnalyticsService],
controllers: [AnalyticsController],
exports: [AnalyticsService],
})
export class AnalyticsModule {}
