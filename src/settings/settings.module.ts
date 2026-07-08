import { Module } from '@nestjs/common';

import { SettingsController } from './settings.controller';
import { UserSettingsController } from './user-settings.controller';

import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, UserSettingsController],

  providers: [SettingsService],
})
export class SettingsModule {}