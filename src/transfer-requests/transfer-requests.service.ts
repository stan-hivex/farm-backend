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
export class TransferRequestsService {
  private readonly logger = new Logger(TransferRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private notificationsService: NotificationsService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // REQUEST FUNDS (Receiver initiates a request)
  // ──────────────────────────────────────────────────────────────────────
  async requestFunds(
    requesterUserId: string,
    dto: {
      sender_identifier: string;
      amount: number;
      description?: string;
    },
    ip: string,
  ) {
    if (dto.amount <= 0)
      throw new BadRequestException('Amount must be greater than zero');

    // Single request ceiling
    const MAX_SINGLE_REQUEST = 100_000; // FARM
    if (dto.amount > MAX_SINGLE_REQUEST) {
      throw new BadRequestException(
        `Single request limit is ${MAX_SINGLE_REQUEST} FARM`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Get requester wallet
      const requesterWallet = await tx.wallets.findFirst({
        where: { user_id: requesterUserId, is_active: true },
      });
      if (!requesterWallet)
        throw new NotFoundException('Requester wallet not found');

      // Find sender user
      const senderUser = await tx.users.findFirst({
        where: {
          OR: [
            { username: dto.sender_identifier },
            { phone: dto.sender_identifier },
          ],
          is_deleted: false,
          is_active: true,
        },
        include: { wallets: { where: { is_active: true }, take: 1 } },
      });

      let senderWalletId: string;
      let senderUserId = senderUser?.id;
      if (senderUser?.wallets[0]) {
        senderWalletId = senderUser.wallets[0].id;
      } else {
        const byAddress = await tx.wallets.findUnique({
          where: { wallet_address: dto.sender_identifier },
        });
        if (!byAddress) throw new NotFoundException('Sender not found');
        senderWalletId = byAddress.id;
        senderUserId = byAddress.user_id ?? undefined;
      }

      if (!senderUserId) {
        const walletOwner = await tx.wallets.findUnique({
          where: { id: senderWalletId },
          select: { user_id: true },
        });
        senderUserId = walletOwner?.user_id ?? undefined;
      }

      if (!senderUserId) {
        throw new NotFoundException('Sender not found');
      }

      if (requesterWallet.id === senderWalletId)
        throw new BadRequestException('Cannot request from yourself');

      // Check if sender is the same user (shouldn't happen but safety check)
      if (requesterUserId === senderUserId)
        throw new BadRequestException('Cannot request from yourself');

      const reference = generateTxReference();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const request = await tx.transfer_requests.create({
        data: {
          request_reference: reference,
          requester_user_id: requesterUserId,
          requester_wallet_id: requesterWallet.id,
          sender_user_id: senderUserId,
          sender_wallet_id: senderWalletId,
          amount: dto.amount,
          currency: 'FARM',
          description:
            dto.description || `Money request from ${senderUser?.username ?? 'a user'}`,
          status: 'pending',
          expires_at: expiresAt,
          ip_address: ip,
        },
        include: {
          users_requester: { select: { id: true, username: true, first_name: true, last_name: true } },
          users_sender: { select: { id: true, username: true, first_name: true, last_name: true } },
        },
      });

      return {
        request,
        data: {
          request_id: request.id,
          request_reference: reference,
          status: 'pending',
          amount: dto.amount,
          expires_at: expiresAt,
        },
        message: 'Transfer request created successfully',
      };
    });

    const request = result.request;
    if (request && request.users_requester && request.users_sender) {
      const title = 'Money request received';
      const body = `${request.users_requester.username ?? 'A user'} requested ${dto.amount} FARM from you.`;
      await Promise.all([
        this.notificationsService.createInApp(request.users_sender.id, {
          type: 'transfer_request',
          title,
          body,
          metadata: {
            request_id: request.id,
            requester_username: request.users_requester.username,
            amount: dto.amount,
          },
        }),
        this.notificationsService.sendPush(request.users_sender.id, title, body, {
          request_id: request.id,
          type: 'transfer_request',
        }),
      ]);
    }

    return {
      data: result.data,
      message: result.message,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET PENDING REQUESTS FOR SENDER (requests where user is the sender)
  // ──────────────────────────────────────────────────────────────────────
  async getPendingRequests(userId: string, query: any) {
    const { skip, take } = paginationParams(query.page, query.limit);
    const now = new Date();

    await this.prisma.transfer_requests.updateMany({
      where: {
        sender_user_id: userId,
        status: 'pending',
        expires_at: {
          lte: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    const requests = await this.prisma.transfer_requests.findMany({
      where: {
        sender_user_id: userId,
        status: 'pending',
        expires_at: {
          gt: now,
        },
      },
      include: {
        users_requester: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            profile_image: true,
          },
        },
        users_sender: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });

    const total = await this.prisma.transfer_requests.count({
      where: {
        sender_user_id: userId,
        status: 'pending',
        expires_at: {
          gt: now,
        },
      },
    });

    return {
      data: requests,
      pagination: {
        total,
        page: query.page || 1,
        limit: query.limit || 10,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // ACCEPT & CONFIRM TRANSFER REQUEST (Sender confirms with PIN)
  // ──────────────────────────────────────────────────────────────────────
  async acceptAndTransfer(
    senderUserId: string,
    dto: {
      request_id: string;
      pin: string;
    },
    ip: string,
  ) {
    await this.authService.verifyPin(senderUserId, dto.pin);

    const result = await this.prisma.$transaction(async (tx) => {
      // Get the transfer request
      const request = await tx.transfer_requests.findUnique({
        where: { id: dto.request_id },
        include: {
          wallets_sender: true,
          wallets_requester: true,
          users_sender: true,
          users_requester: true,
        },
      });

      if (!request) throw new NotFoundException('Transfer request not found');

      if (request.sender_user_id !== senderUserId)
        throw new ForbiddenException('You are not authorized for this request');

      if (request.status !== 'pending')
        throw new BadRequestException(`Request status is ${request.status}`);

      if (request.expires_at && request.expires_at < new Date()) {
        await tx.transfer_requests.update({
          where: { id: request.id },
          data: { status: 'expired' },
        });
        throw new BadRequestException('This request has expired');
      }

      // Validate sender wallet
      if (!request.wallets_sender)
        throw new NotFoundException('Sender wallet not found');
      if (request.wallets_sender.is_frozen)
        throw new ForbiddenException(
          'Your wallet is frozen. Contact support.',
        );

      const senderWallet = request.wallets_sender;
      const requesterWallet = request.wallets_requester;
      const amount = request.amount;

      // Get fee configuration
      const feeCfg = await tx.fee_configurations.findFirst({
        where: { transaction_type: 'transfer', is_active: true },
      });
      const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
      const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
      let fee = new Prisma.Decimal(flatFee);
      if (feeCfg) {
        fee = amount.mul(pctFee).plus(flatFee);
        fee = Prisma.Decimal.max(
          new Prisma.Decimal(feeCfg.minimum_fee ?? 0),
          Prisma.Decimal.min(new Prisma.Decimal(feeCfg.maximum_fee ?? 999999), fee),
        );
      }
      const totalOut = amount.plus(fee);

      // Check sufficient balance
      const senderBalance = senderWallet.balance ?? new Prisma.Decimal(0);
      const senderLocked = senderWallet.locked_balance ?? new Prisma.Decimal(0);
      const available = senderBalance.minus(senderLocked);
      if (available.lt(totalOut))
        throw new BadRequestException(
          `Insufficient balance. Available: ${available.toFixed(2)} FARM`,
        );

      // Create transaction record
      const reference = generateTxReference();
      const transaction = await tx.transactions.create({
        data: {
          transaction_reference: reference,
          sender_wallet_id: senderWallet.id,
          receiver_wallet_id: requesterWallet!.id,
          transaction_type: 'transfer',
          status: 'processing',
          amount: amount,
          fee,
          net_amount: amount.minus(fee),
          currency: 'FARM',
          description: request.description || `Transfer from ${request.users_sender?.username}`,
          ip_address: ip,
          metadata: { request_id: request.id },
        },
      });

      // Update balances
      await tx.wallets.update({
        where: { id: senderWallet.id },
        data: { balance: { decrement: totalOut } },
      });
      await tx.wallets.update({
        where: { id: requesterWallet!.id },
        data: { balance: { increment: amount } },
      });

      // Create ledger entries
      const requesterBalance = requesterWallet!.balance ?? new Prisma.Decimal(0);
      await tx.ledger_entries.createMany({
        data: [
          {
            transaction_id: transaction.id,
            wallet_id: senderWallet.id,
            entry_type: 'debit',
            amount: totalOut,
            balance_before: senderBalance,
            balance_after: senderBalance.minus(totalOut),
            description: `Transfer via request from ${request.users_requester?.username}`,
          },
          {
            transaction_id: transaction.id,
            wallet_id: requesterWallet!.id,
            entry_type: 'credit',
            amount: amount,
            balance_before: requesterBalance,
            balance_after: requesterBalance.plus(amount),
            description: 'Transfer received from request',
          },
        ],
      });

      await tx.transactions.update({
        where: { id: transaction.id },
        data: { status: 'completed', processed_at: new Date() },
      });

      await tx.transfer_requests.update({
        where: { id: request.id },
        data: {
          status: 'completed',
          transaction_id: transaction.id,
          accepted_at: new Date(),
          completed_at: new Date(),
        },
      });

      return {
        data: {
          transaction_reference: reference,
          amount: amount,
          fee,
          status: 'completed',
          request_reference: request.request_reference,
        },
        message: 'Transfer completed successfully',
        requesterUserId: request.requester_user_id,
      };
    });

    await this.notificationsService.notifyTransfer(
      senderUserId,
      result.requesterUserId!,
      Number(result.data.amount),
      result.data.transaction_reference,
    );

    return {
      data: result.data,
      message: result.message,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // REJECT TRANSFER REQUEST (Sender rejects)
  // ──────────────────────────────────────────────────────────────────────
  async rejectRequest(
    senderUserId: string,
    requestId: string,
  ) {
    const request = await this.prisma.transfer_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Transfer request not found');

    if (request.sender_user_id !== senderUserId)
      throw new ForbiddenException('You are not authorized for this request');

    if (request.status !== 'pending')
      throw new BadRequestException(`Request status is ${request.status}`);

    const updated = await this.prisma.transfer_requests.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        rejected_at: new Date(),
      },
    });

    return {
      data: { status: 'rejected', request_reference: updated.request_reference },
      message: 'Transfer request rejected',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // CANCEL TRANSFER REQUEST (Requester cancels their own request)
  // ──────────────────────────────────────────────────────────────────────
  async cancelRequest(
    requesterUserId: string,
    requestId: string,
  ) {
    const request = await this.prisma.transfer_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Transfer request not found');

    if (request.requester_user_id !== requesterUserId)
      throw new ForbiddenException('You are not authorized for this request');

    if (request.status !== 'pending')
      throw new BadRequestException(`Request status is ${request.status}`);

    const updated = await this.prisma.transfer_requests.update({
      where: { id: requestId },
      data: {
        status: 'cancelled',
        updated_at: new Date(),
      },
    });

    return {
      data: { status: 'cancelled', request_reference: updated.request_reference },
      message: 'Transfer request cancelled',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET REQUEST DETAILS
  // ──────────────────────────────────────────────────────────────────────
  async getRequestDetails(
    userId: string,
    requestId: string,
  ) {
    const request = await this.prisma.transfer_requests.findUnique({
      where: { id: requestId },
      include: {
        users_requester: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            profile_image: true,
          },
        },
        users_sender: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
        transactions: {
          select: {
            transaction_reference: true,
            status: true,
          },
        },
      },
    });

    if (!request) throw new NotFoundException('Transfer request not found');

    // Only sender or requester can view
    if (
      request.sender_user_id !== userId &&
      request.requester_user_id !== userId
    ) {
      throw new ForbiddenException('Unauthorized to view this request');
    }

    return { data: request };
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET MY REQUEST HISTORY (both sent and received requests)
  // ──────────────────────────────────────────────────────────────────────
  async getMyRequestHistory(userId: string, query: any) {
    const { skip, take } = paginationParams(query.page, query.limit);

    const requests = await this.prisma.transfer_requests.findMany({
      where: {
        OR: [
          { requester_user_id: userId },
          { sender_user_id: userId },
        ],
      },
      include: {
        users_requester: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            profile_image: true,
          },
        },
        users_sender: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });

    const total = await this.prisma.transfer_requests.count({
      where: {
        OR: [
          { requester_user_id: userId },
          { sender_user_id: userId },
        ],
      },
    });

    return {
      data: requests,
      pagination: {
        total,
        page: query.page || 1,
        limit: query.limit || 10,
      },
    };
  }
}
