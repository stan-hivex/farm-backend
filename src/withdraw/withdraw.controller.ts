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
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { TransferWithdrawDto } from './dto/transfer-withdraw.dto';

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

  @UseGuards(JwtAuthGuard, KycGuard)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  @Post('transfer')
  async transfer(@Req() req, @Body() dto: TransferWithdrawDto) {
    // Normalize to existing CreateWithdrawDto shape expected by service
    const createDto: any = {
      amount: dto.amount,
      method: 'MOBILE_MONEY',
      phoneNumber: dto.phoneNumber,
      accountName: dto.accountName,
      pin: dto.pin,
    };

    return this.withdrawService.createWithdrawal(req.user.id, createDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async history(@Req() req) {
    return this.withdrawService.getUserWithdrawals(
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('status/:reference')
  async getStatus(@Req() req, @Param('reference') reference: string) {
    const status = await this.withdrawService.getWithdrawalStatus(reference, req.user.id);
    if (!status) {
      return { success: false, message: 'Withdrawal not found' };
    }
    return { success: true, status };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.withdrawService.getWithdrawal(id, req.user?.id);
  }
}