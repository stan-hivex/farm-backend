import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsPositive, Length } from 'class-validator';
import { QrService } from './qr.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

class ValidateQrDto { @IsNotEmpty() @IsString() qr_payload!: string; }
class MerchantPayDto {
  @IsNotEmpty() @IsString() qr_payload!: string;
  @IsNumber() @IsPositive() amount!: number;
  @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
}

@ApiTags('QR')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'qr', version: '1' })
export class QrController {
  constructor(private readonly svc: QrService) {}

  @Permissions('qr:write')
  @Post('validate')      @ApiOperation({ summary: 'Validate a scanned QR payload' })
  validate(@Body() dto: ValidateQrDto, @CurrentUser() u: any) { return this.svc.validate(dto.qr_payload, u.id); }

  @Permissions('qr:write')
  @Post('merchant-pay')  @ApiOperation({ summary: 'Pay a merchant via QR (PIN required)' })
  pay(@Body() dto: MerchantPayDto, @CurrentUser() u: any) { return this.svc.merchantPay(u.id, dto); }

  @Permissions('qr:read')
  @Get('receive')        @ApiOperation({ summary: 'Generate personal receive QR' })
  receive(@CurrentUser() u: any, @Query('amount') amount?: number) { return this.svc.generateReceiveQr(u.id, amount); }
}