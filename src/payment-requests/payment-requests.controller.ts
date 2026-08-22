import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { AcceptPaymentRequestDto } from './dto/accept-payment-request.dto';
import { AcceptPaymentRequestsBatchDto } from './dto/accept-payment-requests-batch.dto';
import { PaymentRequestsService } from './payment-requests.service';

@ApiTags('Payment Requests')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'payment-requests', version: '1' })
export class PaymentRequestsController {
  constructor(private readonly svc: PaymentRequestsService) {}

  @Permissions('transfer:write')
  @Post('request')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Request payment from another user' })
  requestPayment(@CurrentUser() u: any, @Body() dto: CreatePaymentRequestDto, @Req() req: Request) {
    return this.svc.createRequest(u.id, dto as any, req.ip || '');
  }

  @Permissions('transfer:read')
  @Get('pending')
  @ApiOperation({ summary: 'Get pending payment requests for me (as recipient)' })
  getPendingRequests(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getPendingRequests(u.id, q);
  }

  @Permissions('transfer:write')
  @Post('accept')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Accept and complete a payment request' })
  acceptAndTransfer(@CurrentUser() u: any, @Body() dto: AcceptPaymentRequestDto, @Req() req: Request) {
    return this.svc.acceptAndTransfer(u.id, dto as any, req.ip || '');
  }

  @Permissions('transfer:write')
  @Post('accept-batch')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Accept and complete multiple payment requests with one authorization' })
  acceptAndTransferBatch(@CurrentUser() u: any, @Body() dto: AcceptPaymentRequestsBatchDto, @Req() req: Request) {
    return this.svc.acceptAndTransferBatch(u.id, dto as any, req.ip || '');
  }

  @Permissions('transfer:write')
  @Post('approve')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Approve a money request' })
  approveRequest(@CurrentUser() u: any, @Body() dto: AcceptPaymentRequestDto, @Req() req: Request) {
    return this.svc.acceptAndTransfer(u.id, dto as any, req.ip || '');
  }

  @Permissions('transfer:write')
  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a payment request' })
  declineRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.rejectRequest(u.id, id);
  }

  @Permissions('transfer:write')
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a payment request' })
  rejectRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.rejectRequest(u.id, id);
  }

  @Permissions('transfer:write')
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a payment request I created' })
  cancelRequest(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.cancelRequest(u.id, id);
  }

  @Permissions('transfer:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get payment request details' })
  getRequestDetails(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.getRequestDetails(u.id, id);
  }

  @Permissions('transfer:read')
  @Get()
  @ApiOperation({ summary: 'Get all my payment requests (sent and received)' })
  getMyRequestHistory(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getMyRequestHistory(u.id, q);
  }
}
