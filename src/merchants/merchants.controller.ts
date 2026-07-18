import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { MerchantsService } from './merchants.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

class ApplyDto {
  @IsNotEmpty() @IsString() business_name!: string;
  @IsOptional() @IsString() business_type?: string;
  @IsOptional() @IsString() business_email?: string;
  @IsOptional() @IsString() business_phone?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
}
class PayoutDto {
  @IsNumber() @IsPositive() amount!: number;
  @IsNotEmpty() @IsString() payout_method!: string;
  @IsNotEmpty() @IsString() account_name!: string;
  @IsNotEmpty() @IsString() account_number!: string;
}

@ApiTags('Merchants')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'merchant', version: '1' })
export class MerchantsController {
  constructor(private readonly svc: MerchantsService) {}

  @Permissions('merchant:write')
  @Post('apply')           apply(@CurrentUser() u: any, @Body() dto: ApplyDto) { return this.svc.apply(u.id, dto); }

  @Permissions('merchant:read')
  @Get()                   get(@CurrentUser() u: any) { return this.svc.getMyMerchant(u.id); }

  @Permissions('merchant:read')
  @Get('dashboard')        dashboard(@CurrentUser() u: any) { return this.svc.getDashboard(u.id); }

  @Permissions('merchant:read')
  @Get('qr')               getQr(@CurrentUser() u: any) { return this.svc.getMerchantQr(u.id); }

  @Permissions('merchant:read')
  @Get('transactions')     transactions(@CurrentUser() u: any, @Query() q: any) { return this.svc.getTransactions(u.id, q); }

  @Permissions('merchant:write')
  @Post('payout')          payout(@CurrentUser() u: any, @Body() dto: PayoutDto) { return this.svc.requestPayout(u.id, dto); }

  @Permissions('merchant:read')
  @Get('payouts')          payouts(@CurrentUser() u: any, @Query() q: any) { return this.svc.getPayouts(u.id, q); }

  @Permissions('merchant:write')
  @Post('qr/regenerate')   regenQr(@CurrentUser() u: any) { return this.svc.regenerateQr(u.id); }
}