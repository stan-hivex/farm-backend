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
import { CacheService } from '../common/cache/cache.service';
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
    private cache: CacheService,
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
      const title = 'Payment Request';
      const body = `${req.users_requester.username ?? 'A user'} requested ${dto.amount} FARM from you.`;
      await this.notificationsService.sendNotification(req.users_recipient.id, {
        type: 'payment_request',
        entityId: req.id,
        title,
        body,
        metadata: {
          request_id: req.id,
          requester_username: req.users_requester.username,
          amount: dto.amount,
        },
      });
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

  async acceptAndTransfer(senderUserId: string, dto: { request_id: string; pin?: string; biometric_auth?: boolean; device_fingerprint?: string }, ip: string) {
    if (dto.biometric_auth) {
      const deviceFingerprint = dto.device_fingerprint || (dto as any).deviceFingerprint;
      if (!deviceFingerprint) throw new BadRequestException('Device fingerprint required for biometric authorization');
      const verifyDevice = (this.authService as any).verifyDevice;
      if (typeof verifyDevice === 'function') {
        const verified = await verifyDevice(senderUserId, deviceFingerprint);
        if (!verified) throw new BadRequestException('Biometric device verification failed');
      } else if (!dto.pin) {
        throw new BadRequestException('Transaction PIN is required');
      } else {
        await this.authService.verifyPin(senderUserId, dto.pin);
      }
    } else {
      if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
      await this.authService.verifyPin(senderUserId, dto.pin);
    }

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

      const feeCfg = await this.getTransferFeeConfig(tx);
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

    await Promise.all([
      this.notificationsService.notifyTransfer(
        senderUserId,
        result.requesterUserId!,
        Number(result.data.amount),
        result.data.transaction_reference,
      ),
      this.notificationsService.sendNotification(result.requesterUserId!, {
        type: 'request_completed',
        entityId: dto.request_id,
        title: 'Request Completed',
        body: 'Your payment request has been paid.',
      }),
      this.notificationsService.sendNotification(senderUserId, {
        type: 'request_completed',
        entityId: dto.request_id,
        title: 'Money Request Paid',
        body: 'You approved a money request and the funds were transferred.',
      }),
    ]);

    return { data: result.data, message: result.message };
  }

  private async getTransferFeeConfig(tx?: any) {
    const cacheKey = 'fee-config:transfer';
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const feeCfg = await (tx ?? this.prisma).fee_configurations.findFirst({
      where: { transaction_type: 'transfer', is_active: true },
    });
    if (feeCfg) {
      await this.cache.cacheSet(cacheKey, feeCfg, 300);
    }
    return feeCfg;
  }

  async rejectRequest(senderUserId: string, requestId: string) {
    const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.recipient_user_id !== senderUserId) throw new ForbiddenException('You are not authorized for this request');
    if (request.status !== 'pending') throw new BadRequestException(`Request status is ${request.status}`);
    const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'rejected', rejected_at: new Date() } });
    await Promise.all([
      this.notificationsService.sendNotification(request.requester_user_id!, {
        type: 'request_declined',
        entityId: request.id,
        title: 'Request Declined',
        body: 'Your payment request was declined.',
      }),
      this.notificationsService.sendNotification(senderUserId, {
        type: 'request_declined',
        entityId: request.id,
        title: 'Money Request Declined',
        body: 'You declined the money request.',
      }),
    ]);
    return { data: { status: 'rejected', request_reference: updated.request_reference }, message: 'Payment request rejected' };
  }

  async cancelRequest(requesterUserId: string, requestId: string) {
    const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.requester_user_id !== requesterUserId) throw new ForbiddenException('You are not authorized for this request');
    if (request.status !== 'pending') throw new BadRequestException(`Request status is ${request.status}`);
    const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'cancelled', updated_at: new Date() } });
    await this.notificationsService.sendNotification(request.requester_user_id!, {
      type: 'request_declined',
      entityId: request.id,
      title: 'Payment Request Cancelled',
      body: 'Your payment request was cancelled.',
    });
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

  async processExpiredRequests(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.payment_requests.findMany({ where: { status: 'pending', expires_at: { lte: now } } });
    if (!expired || expired.length === 0) return 0;

    let processed = 0;
    for (const request of expired) {
      try {
        await this.prisma.payment_requests.update({ where: { id: request.id }, data: { status: 'expired' } });

        const amount = Number((request as any).amount ?? 0);
        await Promise.all([
          request.requester_user_id ? this.notificationsService.sendNotification(request.requester_user_id, {
            type: 'request_expired',
            entityId: request.id,
            title: 'Money Request Expired',
            body: `Your money request for ${amount} FARM expired.`,
            metadata: { request_id: request.id, amount },
          }) : Promise.resolve(null),
          request.recipient_user_id ? this.notificationsService.sendNotification(request.recipient_user_id, {
            type: 'request_expired',
            entityId: request.id,
            title: 'Money Request Expired',
            body: `A money request for ${amount} FARM expired.`,
            metadata: { request_id: request.id, amount },
          }) : Promise.resolve(null),
        ]).catch((err) => this.logger.error('Payment request expiry notification failed', err));

        processed++;
      } catch (e) {
        this.logger.error(`Failed to process expiry for payment request ${request.id}: ${e}`);
      }
    }

    return processed;
  }
}
