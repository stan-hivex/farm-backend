import {
  Body,
  Controller,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { IsString, IsIn } from 'class-validator';

import { SettingsService } from './settings.service';
import { Permissions } from '../common/decorators/permissions.decorator';

class UpdateLanguageDto {
  @IsString()
  @IsIn(['en', 'es', 'fr', 'de', 'pt', 'sw'])
  language!: string;
}

class UpdateThemeDto {
  @IsString()
  @IsIn(['light', 'dark', 'auto'])
  theme!: string;
}

@Controller('settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
  ) {}

  @Permissions('settings:write')
  @Put('language')
  async updateLanguage(
    @Req() req,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.settingsService.updateLanguage(
      req.user.id,
      dto.language,
    );
  }

  @Permissions('settings:write')
  @Put('theme')
  async updateTheme(
    @Req() req,
    @Body() dto: UpdateThemeDto,
  ) {
    return this.settingsService.updateTheme(
      req.user.id,
      dto.theme,
    );
  }
}