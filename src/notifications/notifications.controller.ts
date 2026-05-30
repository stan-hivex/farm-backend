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

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {

  constructor(
    private readonly notificationsService:
      NotificationsService,
  ) {}

  @Get('settings')
  async getSettings(
    @Req() req,
  ) {

    return this.notificationsService.getSettings(
      req.user.id,
    );
  }

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
