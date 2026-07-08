import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean } from 'class-validator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SettingsService } from './settings.service';

class UpdateNotificationSettingsDto {
  @IsBoolean()
  push_notifications!: boolean;

  @IsBoolean()
  email_notifications!: boolean;

  @IsBoolean()
  in_app_notifications!: boolean;

  @IsBoolean()
  sms_notifications!: boolean;

  @IsBoolean()
  sound_enabled!: boolean;

  @IsBoolean()
  vibration_enabled!: boolean;
}

@Controller('user/settings')
@UseGuards(AuthGuard('jwt'))
export class UserSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Permissions('notifications:read')
  @Get('notifications')
  async getNotificationSettings(@Req() req) {
    return this.settingsService.getNotificationSettings(req.user.id);
  }

  @Permissions('notifications:write')
  @Patch('notifications')
  async updateNotificationSettings(
    @Req() req,
    @Body() body: UpdateNotificationSettingsDto,
  ) {
    return this.settingsService.updateNotificationSettings(req.user.id, body);
  }
}
