import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { NfcPayService } from './nfc-pay.service';

class CreateNfcRequestDto {
  @IsNumber() @Min(0.01) @Max(10_000_000) amount!: number;
  @IsOptional() @IsString() @MaxLength(140) description?: string;
  @IsOptional() @IsNumber() @Min(15) @Max(120) ttl_seconds?: number;
}
class PayNfcDto {
  @IsString() @MaxLength(400) token!: string;
  @IsOptional() @IsString() @MaxLength(12) pin?: string;
}

@ApiTags('Tap to pay')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'nfc-pay', version: '1' })
export class NfcPayController {
  constructor(private readonly svc: NfcPayService) {}

  @Get('config') config() {
    return { data: { enabled: this.svc.enabled() } };
  }

  @Permissions('transfer:write')
  @Post('requests')
  @UseGuards(JwtGuard, KycGuard)
  create(@CurrentUser() u: any, @Body() dto: CreateNfcRequestDto) {
    return this.svc.create(u.id, dto);
  }

  @Permissions('transfer:read')
  @Get('requests/:id')
  status(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.status(u.id, id);
  }

  @Permissions('transfer:read')
  @Get('resolve')
  resolve(@CurrentUser() u: any, @Query('token') token: string) {
    return this.svc.resolve(u.id, token);
  }

  @Permissions('transfer:write')
  @Post('pay')
  @UseGuards(JwtGuard, KycGuard)
  pay(@CurrentUser() u: any, @Body() dto: PayNfcDto, @Req() req: Request) {
    return this.svc.pay(u.id, dto, req.ip || '');
  }
}
