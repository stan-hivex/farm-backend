import {
  Body,
  Controller,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
  ) {}

  @Put('language')
  async updateLanguage(
    @Req() req,
    @Body() body,
  ) {
    return this.settingsService.updateLanguage(
      req.user.id,
      body.language,
    );
  }
}