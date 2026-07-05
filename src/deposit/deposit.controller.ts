import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequireOwnership } from '../common/decorators/ownership.decorator';

import { DepositService } from './deposit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateDepositDto {
  @IsNotEmpty()
  @IsNumber()
  amount_fiat!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  // Accept frontend field name variations
  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  payment_channel?: string;

  @IsOptional()
  @IsString()
  payment_provider?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

@Controller({ path: 'deposit', version: '1' })
@UseGuards(JwtAuthGuard)
export class DepositController {
  constructor(
    private readonly depositService: DepositService,
  ) {}

  @Permissions('payments:write')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  @Post('create')
  async create(
    @Req() req: any,
    @Body() dto: CreateDepositDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    return this.depositService.createDeposit(
      userId,
      dto,
    );
  }

  @Permissions('payments:read')
  @Get('history')
  async history(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    return this.depositService.getUserDeposits(
      userId,
    );
  }

  @Permissions('payments:read')
  @Get('wallet')
  async wallet(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    return this.depositService.getWalletBalance(
      userId,
    );
  }

  @Permissions('payments:read')
  @RequireOwnership('id')
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.depositService.getDepositById(id, userId);
  }
}