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

import { WithdrawService } from './withdraw.service';
import { KycGuard } from '../common/guards/kyc.guard';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateWithdrawDto } from './dto/create-withdraw.dto';

@Controller({
  path: 'withdraw',
  version: '1',
})
export class WithdrawController {
  constructor(
    private readonly withdrawService: WithdrawService,
  ) {}

  @UseGuards(JwtAuthGuard, KycGuard)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  @Post('create')
  async create(
    @Req() req,
    @Body() dto: CreateWithdrawDto,
  ) {
    return this.withdrawService.createWithdrawal(
      req.user.id,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async history(@Req() req) {
    return this.withdrawService.getUserWithdrawals(
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.withdrawService.getWithdrawal(id);
  }
}