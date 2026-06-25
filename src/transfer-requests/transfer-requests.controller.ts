import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  Length,
} from 'class-validator';
import { TransferRequestsService } from './transfer-requests.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class RequestFundsDto {
  @IsNotEmpty() @IsString() sender_identifier!: string;
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() description?: string;
}

class AcceptTransferDto {
  @IsNotEmpty() @IsString() request_id!: string;
  @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
}

@ApiTags('Transfer Requests')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'transfer-requests', version: '1' })
export class TransferRequestsController {
  constructor(private readonly svc: TransferRequestsService) {}

  @Post('request')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Request funds from another user' })
  requestFunds(
    @CurrentUser() u: any,
    @Body() dto: RequestFundsDto,
    @Req() req: Request,
  ) {
    return this.svc.requestFunds(u.id, dto, req.ip || '');
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending transfer requests for me (as sender)' })
  getPendingRequests(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getPendingRequests(u.id, q);
  }

  @Post('accept')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Accept and complete a transfer request' })
  acceptAndTransfer(
    @CurrentUser() u: any,
    @Body() dto: AcceptTransferDto,
    @Req() req: Request,
  ) {
    return this.svc.acceptAndTransfer(u.id, dto, req.ip || '');
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a transfer request' })
  rejectRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.rejectRequest(u.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a transfer request I created' })
  cancelRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.cancelRequest(u.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer request details' })
  getRequestDetails(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.getRequestDetails(u.id, id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all my transfer requests (sent and received)' })
  getMyRequestHistory(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getMyRequestHistory(u.id, q);
  }
}
