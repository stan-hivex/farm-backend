import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateTxReference } from '../common/utils/reference.util';
import { paginationParams } from '../common/utils/pagination.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger(PaymentRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private notificationsService: NotificationsService,
  ) {}

  async createRequest(requesterUserId: string, dto: { recipient_identifier: string; amount: number; description?: string }, ip: string) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be greater than zero');

    const MAX_SINGLE_REQUEST = 100_000;
    if (dto.amount > MAX_SINGLE_REQUEST) throw new BadRequestException(`Single request limit is ${MAX_SINGLE_REQUEST} FARM`);

    const result = await this.prisma.$transaction(async (tx) => {
      const requesterWallet = await tx.wallets.findFirst({ where: { user_id: requesterUserId, is_active: true } });
      if (!requesterWallet) throw new NotFoundException('Requester wallet not found');

      const recipientUser = await tx.users.findFirst({
        where: {
          OR: [{ username: dto.recipient_identifier }, { phone: dto.recipient_identifier }],
          is_deleted: false,
          is_active: true,
        },
        include: { wallets: { where: { is_active: true }, take: 1 } },
      });

      let recipientWalletId: string;
      let recipientUserId = recipientUser?.id;
      if (recipientUser?.wallets[0]) {
        recipientWalletId = recipientUser.wallets[0].id;
      } else {
        const byAddress = await tx.wallets.findUnique({ where: { wallet_address: dto.recipient_identifier } });
        if (!byAddress) throw new NotFoundException('Recipient not found');
        recipientWalletId = byAddress.id;
        recipientUserId = byAddress.user_id ?? undefined;
      }

      if (!recipientUserId) {
        const walletOwner = await tx.wallets.findUnique({ where: { id: recipientWalletId }, select: { user_id: true } });
        recipientUserId = walletOwner?.user_id ?? undefined;
      }

      if (!recipientUserId) throw new NotFoundException('Recipient not found');

      if (requesterWallet.id === recipientWalletId) throw new BadRequestException('Cannot request from yourself');

      if (requesterUserId === recipientUserId) throw new BadRequestException('Cannot request from yourself');

      const reference = generateTxReference();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const request = await tx.payment_requests.create({
        data: {
          request_reference: reference,
          requester_user_id: requesterUserId,
          requester_wallet_id: requesterWallet.id,
          recipient_user_id: recipientUserId,
          recipient_wallet_id: recipientWalletId,
          amount: dto.amount,
          currency: 'FARM',
          description: dto.description || `Money request to ${dto.recipient_identifier}`,
          status: 'pending',
          expires_at: expiresAt,
          ip_address: ip,
        },
        include: {
          users_requester: { select: { id: true, username: true, first_name: true, last_name: true } },
          users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } },
        },
      });

      return {
        request,
        data: { request_id: request.id, request_reference: reference, status: 'pending', amount: dto.amount, expires_at: expiresAt },
        message: 'Payment request created successfully',
      };
    });

    const req = result.request;
    if (req && req.users_requester && req.users_recipient) {
      const title = 'Payment request received';
      const body = `${req.users_requester.username ?? 'A user'} requested ${dto.amount} FARM from you.`;
      await Promise.all([
        this.notificationsService.createInApp(req.users_recipient.id, { type: 'transfer_request', title, body, metadata: { request_id: req.id, requester_username: req.users_requester.username, amount: dto.amount } }),
        this.notificationsService.sendPush(req.users_recipient.id, title, body, { request_id: req.id, type: 'transfer_request' }),
      ]);
    }

    return { data: result.data, message: result.message };
  }

  async getPendingRequests(userId: string, query: any) {
    const { skip, take } = paginationParams(query.page, query.limit);
    const now = new Date();

    await this.prisma.payment_requests.updateMany({ where: { recipient_user_id: userId, status: 'pending', expires_at: { lte: now } }, data: { status: 'expired' } });

    const requests = await this.prisma.payment_requests.findMany({
      where: { recipient_user_id: userId, status: 'pending', expires_at: { gt: now } },
      include: {
        users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } },
        users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });

    const total = await this.prisma.payment_requests.count({ where: { recipient_user_id: userId, status: 'pending', expires_at: { gt: now } } });

    return { data: requests, pagination: { total, page: query.page || 1, limit: query.limit || 10 } };
  }

  async acceptAndTransfer(senderUserId: string, dto: { request_id: string; pin: string }, ip: string) {
    await this.authService.verifyPin(senderUserId, dto.pin);

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.payment_requests.findUnique({ where: { id: dto.request_id }, include: { wallets_recipient: true, wallets_requester: true, users_recipient: true, users_requester: true } });

      if (!request) throw new NotFoundException('Payment request not found');

      if (request.recipient_user_id !== senderUserId) throw new ForbiddenException('You are not authorized for this request');

      if (request.status !== 'pending') throw new BadRequestException(`Request status is ${request.status}`);

      if (request.expires_at && request.expires_at < new Date()) {
        await tx.payment_requests.update({ where: { id: request.id }, data: { status: 'expired' } });
        throw new BadRequestException('This request has expired');
      }

      if (!request.wallets_recipient) throw new NotFoundException('Payer wallet not found');
      if (request.wallets_recipient.is_frozen) throw new ForbiddenException('Your wallet is frozen. Contact support.');

      const payerWallet = request.wallets_recipient;
      const requesterWallet = request.wallets_requester;
      const amount = request.amount as any;

      const feeCfg = await tx.fee_configurations.findFirst({ where: { transaction_type: 'transfer', is_active: true } });
      const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
      const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
      let fee = new Prisma.Decimal(flatFee);
      if (feeCfg) {
        fee = amount.mul(pctFee).plus(flatFee);
        fee = Prisma.Decimal.max(new Prisma.Decimal(feeCfg.minimum_fee ?? 0), Prisma.Decimal.min(new Prisma.Decimal(feeCfg.maximum_fee ?? 999999), fee));
      }
      const totalOut = amount.plus(fee);

      const payerBalance = payerWallet.balance ?? new Prisma.Decimal(0);
      const payerLocked = payerWallet.locked_balance ?? new Prisma.Decimal(0);
      const available = payerBalance.minus(payerLocked);
      if (available.lt(totalOut)) throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);

      const reference = generateTxReference();
      const transaction = await tx.transactions.create({ data: { transaction_reference: reference, sender_wallet_id: payerWallet.id, receiver_wallet_id: requesterWallet!.id, transaction_type: 'transfer', status: 'processing', amount: amount, fee, net_amount: amount.minus(fee), currency: 'FARM', description: request.description || `Payment request from ${request.users_recipient?.username}`, ip_address: ip, metadata: { request_id: request.id } } });

      await tx.wallets.update({ where: { id: payerWallet.id }, data: { balance: { decrement: totalOut } } });
      await tx.wallets.update({ where: { id: requesterWallet!.id }, data: { balance: { increment: amount } } });

      const requesterBalance = requesterWallet!.balance ?? new Prisma.Decimal(0);
      await tx.ledger_entries.createMany({ data: [ { transaction_id: transaction.id, wallet_id: payerWallet.id, entry_type: 'debit', amount: totalOut, balance_before: payerBalance, balance_after: payerBalance.minus(totalOut), description: `Payment via request from ${request.users_requester?.username}` }, { transaction_id: transaction.id, wallet_id: requesterWallet!.id, entry_type: 'credit', amount: amount, balance_before: requesterBalance, balance_after: requesterBalance.plus(amount), description: 'Payment received from request' }, ] });

      await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'completed', processed_at: new Date() } });

      await tx.payment_requests.update({ where: { id: request.id }, data: { status: 'completed', transaction_id: transaction.id, accepted_at: new Date(), completed_at: new Date() } });

      return { data: { transaction_reference: reference, amount: amount, fee, status: 'completed', request_reference: request.request_reference }, message: 'Payment completed successfully', requesterUserId: request.requester_user_id };
    });

    await this.notificationsService.notifyTransfer(senderUserId, result.requesterUserId!, Number(result.data.amount), result.data.transaction_reference);

    return { data: result.data, message: result.message };
  }

  async rejectRequest(senderUserId: string, requestId: string) {
    const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.recipient_user_id !== senderUserId) throw new ForbiddenException('You are not authorized for this request');
    if (request.status !== 'pending') throw new BadRequestException(`Request status is ${request.status}`);
    const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'rejected', rejected_at: new Date() } });
    return { data: { status: 'rejected', request_reference: updated.request_reference }, message: 'Payment request rejected' };
  }

  async cancelRequest(requesterUserId: string, requestId: string) {
    const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.requester_user_id !== requesterUserId) throw new ForbiddenException('You are not authorized for this request');
    if (request.status !== 'pending') throw new BadRequestException(`Request status is ${request.status}`);
    const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'cancelled', updated_at: new Date() } });
    return { data: { status: 'cancelled', request_reference: updated.request_reference }, message: 'Payment request cancelled' };
  }

  async getRequestDetails(userId: string, requestId: string) {
    const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId }, include: { users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } }, users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } }, transactions: { select: { transaction_reference: true, status: true } } } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.recipient_user_id !== userId && request.requester_user_id !== userId) throw new ForbiddenException('Unauthorized to view this request');
    return { data: request };
  }

  async getMyRequestHistory(userId: string, query: any) {
    const { skip, take } = paginationParams(query.page, query.limit);
    const requests = await this.prisma.payment_requests.findMany({ where: { OR: [{ requester_user_id: userId }, { recipient_user_id: userId }] }, include: { users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } }, users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } } }, orderBy: { created_at: 'desc' }, skip, take });
    const total = await this.prisma.payment_requests.count({ where: { OR: [{ requester_user_id: userId }, { recipient_user_id: userId }] } });
    return { data: requests, pagination: { total, page: query.page || 1, limit: query.limit || 10 } };
  }
}
