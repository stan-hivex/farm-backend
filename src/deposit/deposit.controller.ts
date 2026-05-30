import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { DepositService } from './deposit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller({ path: 'deposit', version: '1' })
@UseGuards(JwtAuthGuard)
export class DepositController {
  constructor(
    private readonly depositService: DepositService,
  ) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  @Post('create')
  async create(
    @Req() req: any,
    @Body() dto: any,
  ) {
    const userId = req.user.id;

    return this.depositService.createDeposit(
      userId,
      dto,
    );
  }

  @Get('history')
  async history(@Req() req: any) {
    const userId = req.user.id;

    return this.depositService.getUserDeposits(
      userId,
    );
  }

  @Get('wallet')
  async wallet(@Req() req: any) {
    const userId = req.user.id;

    return this.depositService.getWalletBalance(
      userId,
    );
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.depositService.getDepositById(id);
  }
}