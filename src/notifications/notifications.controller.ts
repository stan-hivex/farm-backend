import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { NotificationsService }
from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {

  constructor(
    private readonly notificationsService:
      NotificationsService,
  ) {}

  @Permissions('notifications:read')
  @Get('settings')
  async getSettings(
    @Req() req,
  ) {

    return this.notificationsService.getSettings(
      req.user.id,
    );
  }

  @Permissions('notifications:write')
  @Put('settings')
  async updateSettings(

    @Req() req,

    @Body() body,
  ) {

    return this.notificationsService.updateSettings(
      req.user.id,
      body,
    );
  }

  @Permissions('notifications:write')
  @Post('device-token')
  async registerDeviceToken(
    @Req() req,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerDeviceToken(
      req.user.id,
      body.token,
      body.platform,
    );
  }

  @Permissions('notifications:write')
  @Delete('device-token')
  async removeDeviceToken(
    @Req() req,
    @Body() body: { token: string },
  ) {
    return this.notificationsService.removeDeviceToken(
      req.user.id,
      body.token,
    );
  }
}
