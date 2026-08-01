import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateEscrowReference, generateTxReference } from '../common/utils/reference.util';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private paystack: PaystackService,
    private notificationsService: NotificationsService,
    private securityService: SecurityService,
  ) {}

  private async getSuperadminWallet() {
    const superadmin = await this.prisma.users.findFirst({
      where: { role: 'super_admin', is_deleted: false },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    if (!superadmin?.wallets[0]) {
      throw new NotFoundException('Superadmin wallet not found');
    }
    return superadmin.wallets[0];
  }

  private async getSuperadminWalletInTx(tx: any) {
    const superadmin = await tx.users.findFirst({
      where: { role: 'super_admin', is_deleted: false },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    if (!superadmin?.wallets[0]) {
      throw new NotFoundException('Superadmin wallet not found');
    }
    return superadmin.wallets[0];
  }

  private async creditSuperadminWalletInTx(tx: any, amount: number, description: string) {
    if (amount <= 0) return;
    
    const wallet = await this.getSuperadminWalletInTx(tx);
    await tx.wallets.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.ledger_entries.create({
      data: {
        wallet_id: wallet.id,
        entry_type: 'credit',
        amount,
        description,
      },
    });
  }

  async create(buyerId: string, dto: {
    seller_identifier: string; amount: number; title: string;
    description?: string; auto_release_days?: number; pin?: string; biometric_auth?: boolean; device_fingerprint?: string;
  }) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');

    if (dto.biometric_auth) {
      if (!dto.device_fingerprint) throw new BadRequestException('Device fingerprint required for biometric authorization');
      const verified = await this.securityService.verifyDevice(buyerId, dto.device_fingerprint);
      if (!verified || (verified as any).trusted !== true) {
        throw new BadRequestException('Biometric device verification failed');
      }
    } else {
      if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
      await this.authService.verifyPin(buyerId, dto.pin);
    }

    const buyer = await this.prisma.users.findUnique({
      where: { id: buyerId },
      include: { wallets: { take: 1 } },
    });
    if (!buyer?.wallets[0]) throw new NotFoundException('Buyer wallet not found');

    const seller = await this.prisma.users.findFirst({
      where: {
        OR: [{ username: dto.seller_identifier }, { phone: dto.seller_identifier }],
        is_deleted: false,
      },
      include: { wallets: { take: 1 } },
    });
    if (!seller?.wallets[0]) throw new NotFoundException('Seller not found');
    if (seller.id === buyerId) throw new BadRequestException('Cannot create escrow with yourself');

    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recentDuplicate = await this.prisma.escrow_contracts.findFirst({
      where: {
        buyer_id: buyerId,
        seller_id: seller.id,
        amount: dto.amount,
        created_at: { gte: oneMinuteAgo },
      },
    });
    if (recentDuplicate) {
      throw new BadRequestException('You can only create one escrow with the same seller and amount once every minute');
    }

    const fee = Number((dto.amount * 0.015).toFixed(2)); // fixed 1.5% escrow creation fee
    const totalRequired = dto.amount + fee;
    const available = Number(buyer.wallets[0].balance) - Number(buyer.wallets[0].locked_balance);
    if (available < totalRequired)
      throw new BadRequestException(`Insufficient balance. Need ${totalRequired} FARM`);

    const auto_release_at = new Date(
      Date.now() + (dto.auto_release_days || 7) * 86400_000,
    );

    const contract = await this.prisma.$transaction(async (tx) => {
      const c = await tx.escrow_contracts.create({
        data: {
          reference_code: generateEscrowReference(),
          buyer_id: buyerId,
          seller_id: seller.id,
          buyer_wallet_id: buyer.wallets[0].id,
          seller_wallet_id: seller.wallets[0].id,
          amount: dto.amount,
          fee,
          title: dto.title,
          description: dto.description,
          auto_release_at,
          status: 'pending',
        },
      });
      await tx.wallets.update({
        where: { id: buyer.wallets[0].id },
        data: {
          balance: { decrement: fee },
          locked_balance: { increment: dto.amount },
        },
      });
      await tx.escrow_contracts.update({
        where: { id: c.id },
        data: { status: 'active', funded_at: new Date() },
      });
      await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          sender_wallet_id: buyer.wallets[0].id,
          transaction_type: 'escrow_lock',
          status: 'completed',
          amount: dto.amount,
          fee,
          net_amount: dto.amount,
          description: `Escrow lock: ${dto.title}`,
          metadata: { user_id: buyerId, escrow_id: c.id },
          processed_at: new Date(),
        },
      });
      // Credit escrow fee to superadmin wallet
      if (Number(fee) > 0) {
        await this.creditSuperadminWalletInTx(
          tx,
          Number(fee),
          `Escrow creation fee from ${buyer.username}: ${dto.title}`,
        );
      }
      return c;
    });

    await Promise.all([
      this.notificationsService.sendNotification(buyerId, {
        type: 'escrow_created',
        title: 'Escrow created',
        body: `Your escrow for ${seller.username} has been funded with ${dto.amount} FARM.`,
        entityId: contract.id,
        metadata: {
          escrow_id: contract.id,
          amount: dto.amount,
          seller_username: seller.username,
        },
      }),
      this.notificationsService.sendNotification(seller.id, {
        type: 'escrow_received',
        title: 'New escrow received',
        body: `${buyer.username} funded an escrow for ${dto.amount} FARM.`,
        entityId: contract.id,
        metadata: {
          escrow_id: contract.id,
          amount: dto.amount,
          buyer_username: buyer.username,
        },
      }),
    ]).catch((error) => this.logger.error('Escrow notification failed', error));

    return {
      data: { ...contract, amount: Number(contract.amount), fee: Number(contract.fee) },
      message: 'Escrow created and funded',
    };
  }

  async release(escrowId: string, buyerId: string, dto?: { pin?: string; biometric_auth?: boolean; device_fingerprint?: string }) {
    if (dto?.biometric_auth) {
      if (!dto.device_fingerprint) throw new BadRequestException('Device fingerprint required for biometric authorization');
      const verified = await this.securityService.verifyDevice(buyerId, dto.device_fingerprint);
      if (!verified || (verified as any).trusted !== true) {
        throw new BadRequestException('Biometric device verification failed');
      }
    } else {
      if (!dto?.pin) throw new BadRequestException('Transaction PIN is required');
      await this.authService.verifyPin(buyerId, dto.pin);
    }

    const escrow = await this.getEscrowOrFail(escrowId);
    if (escrow.buyer_id !== buyerId) throw new ForbiddenException('Only the buyer can release');
    if (escrow.status !== 'active')
      throw new BadRequestException(`Cannot release escrow with status: ${escrow.status}`);
    await this.executeRelease(escrow);
    return { message: 'Escrow released to seller' };
  }

  async dispute(escrowId: string, userId: string, dto: { reason: string }) {
    const escrow = await this.getEscrowOrFail(escrowId);
    if (escrow.buyer_id !== userId && escrow.seller_id !== userId)
      throw new ForbiddenException('Not a party to this escrow');
    if (escrow.status !== 'active')
      throw new BadRequestException('Can only dispute an active escrow');
    const otherPartyId = escrow.buyer_id === userId ? escrow.seller_id : escrow.buyer_id;
    await this.prisma.escrow_contracts.update({
      where: { id: escrowId },
      data: {
        status: 'disputed',
        disputed_at: new Date(),
        evidence: { reason: dto.reason, disputed_by: userId },
      },
    });
    await this.prisma.escrow_messages.create({
      data: { escrow_id: escrowId, sender_id: userId, message: `DISPUTE RAISED: ${dto.reason}` },
    });

    await Promise.all([
      this.notificationsService.sendNotification(userId, {
        type: 'escrow_disputed',
        entityId: escrow.id,
        title: 'Dispute Raised',
        body: `You have raised a dispute for escrow: ${escrow.title}. Our admin team will review within 24 hours.`,
        metadata: {
          escrow_id: escrow.id,
          reason: dto.reason,
          amount: Number(escrow.amount),
        },
      }),
      this.notificationsService.sendNotification(otherPartyId, {
        type: 'escrow_disputed',
        entityId: escrow.id,
        title: 'Escrow Under Dispute',
        body: `A dispute has been raised for escrow: ${escrow.title}. Our admin team will investigate.`,
        metadata: {
          escrow_id: escrow.id,
          disputed_by: userId,
          amount: Number(escrow.amount),
        },
      }),
    ]).catch((error) => this.logger.error('Escrow dispute notification failed', error));

    return { message: 'Dispute raised. Admin will review within 24 hours.' };
  }

  async cancel(escrowId: string, userId: string) {
    const escrow = await this.getEscrowOrFail(escrowId);
    if (escrow.buyer_id !== userId) throw new ForbiddenException('Only buyer can cancel');
    if (escrow.status === 'active')
      throw new BadRequestException('Cannot cancel a funded escrow. Raise a dispute instead.');
    if (escrow.status !== 'pending')
      throw new BadRequestException(`Cannot cancel escrow with status: ${escrow.status}`);
    await this.prisma.escrow_contracts.update({
      where: { id: escrowId }, data: { status: 'cancelled' },
    });

    await this.notificationsService.sendNotification(escrow.seller_id, {
      type: 'escrow_cancelled',
      entityId: escrow.id,
      title: 'Escrow Cancelled',
      body: `The escrow for ${escrow.title} has been cancelled by the buyer.`,
      metadata: {
        escrow_id: escrow.id,
        title: escrow.title,
        amount: Number(escrow.amount),
        cancelled_by: userId,
      },
    }).catch((error) => this.logger.error('Escrow cancellation notification failed', error));

    return { message: 'Escrow cancelled' };
  }

  async addMessage(escrowId: string, senderId: string, message: string) {
    const escrow = await this.getEscrowOrFail(escrowId);
    if (escrow.buyer_id !== senderId && escrow.seller_id !== senderId)
      throw new ForbiddenException('Not a party to this escrow');
    const msg = await this.prisma.escrow_messages.create({
      data: { escrow_id: escrowId, sender_id: senderId, message },
    });
    return { data: msg };
  }

  async list(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = { OR: [{ buyer_id: userId }, { seller_id: userId }] };
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.escrow_contracts.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          escrow_messages: { orderBy: { created_at: 'asc' } },
          users_escrow_contracts_buyer_idTousers: true,
          users_escrow_contracts_seller_idTousers: true,
        },
      }),
      this.prisma.escrow_contracts.count({ where }),
    ]);
    return {
      data: items.map((e) => ({ ...e, amount: Number(e.amount), fee: Number(e.fee) })),
      meta: paginate(total, page, limit),
    };
  }

  async getOne(escrowId: string, userId: string) {
    const escrow = await this.prisma.escrow_contracts.findUnique({
      where: { id: escrowId },
      include: {
        escrow_messages: { orderBy: { created_at: 'asc' } },
        users_escrow_contracts_buyer_idTousers: { select: { username: true, first_name: true } },
        users_escrow_contracts_seller_idTousers: { select: { username: true, first_name: true } },
      },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.buyer_id !== userId && escrow.seller_id !== userId)
      throw new ForbiddenException('Access denied');
    return { data: { ...escrow, amount: Number(escrow.amount), fee: Number(escrow.fee) } };
  }

  async processAutoReleases() {
    const expired = await this.prisma.escrow_contracts.findMany({
      where: { status: 'active', auto_release_at: { lte: new Date() } },
    });
    let released = 0;
    for (const escrow of expired) {
      try { await this.executeRelease(escrow); released++; }
      catch (e) { this.logger.error(`Auto-release failed for ${escrow.id}: ${e}`); }
    }
    if (released) this.logger.log(`Auto-released ${released} escrow(s)`);
    return released;
  }

  async executeRelease(escrow: any) {
    const releaseFee = Number((Number(escrow.amount) * 0.015).toFixed(2)); // 1.5% release fee
    const amountToSeller = Number(escrow.amount) - releaseFee;
    const amountLocked = Number(escrow.amount);

    await this.prisma.$transaction(async (tx) => {
      // Deduct only the locked escrow amount from buyer's wallet. The creation fee was already charged at escrow creation.
      await tx.wallets.update({
        where: { id: escrow.buyer_wallet_id },
        data: { locked_balance: { decrement: amountLocked }, balance: { decrement: amountLocked } },
      });
      // Credit seller's wallet with amount minus release fee
      await tx.wallets.update({
        where: { id: escrow.seller_wallet_id },
        data: { balance: { increment: amountToSeller } },
      });
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          sender_wallet_id: escrow.buyer_wallet_id,
          receiver_wallet_id: escrow.seller_wallet_id,
          transaction_type: 'escrow_release',
          status: 'completed',
          amount: Number(escrow.amount),
          fee: releaseFee,
          net_amount: amountToSeller,
          description: `Escrow release: ${escrow.title}`,
          metadata: { user_id: escrow.buyer_id, escrow_id: escrow.id },
          processed_at: new Date(),
        },
      });
      await tx.ledger_entries.createMany({
        data: [
          {
            transaction_id: txn.id, wallet_id: escrow.buyer_wallet_id,
            entry_type: 'debit', amount: amountLocked,
            description: `Escrow release ${escrow.reference_code}`,
          },
          {
            transaction_id: txn.id, wallet_id: escrow.seller_wallet_id,
            entry_type: 'credit', amount: amountToSeller,
            description: `Escrow release ${escrow.reference_code} (after 1.5% fee)`,
          },
        ],
      });
      await tx.escrow_contracts.update({
        where: { id: escrow.id }, data: { status: 'completed', released_at: new Date() },
      });
      // Credit release fee to superadmin wallet
      if (releaseFee > 0) {
        await this.creditSuperadminWalletInTx(
          tx,
          releaseFee,
          `Escrow release fee: ${escrow.title}`,
        );
      }
    });

    await Promise.all([
      this.notificationsService.sendNotification(escrow.buyer_id, {
        type: 'escrow_released',
        title: 'Escrow released',
        body: `Your escrow for ${escrow.title} was released and ${amountToSeller} FARM was paid to ${escrow.seller_id === escrow.buyer_id ? 'the seller' : 'the seller'}.`,
        entityId: escrow.id,
        metadata: {
          escrow_id: escrow.id,
          amount: Number(escrow.amount),
          released_amount: amountToSeller,
          seller_id: escrow.seller_id,
        },
      }),
      this.notificationsService.sendNotification(escrow.seller_id, {
        type: 'escrow_received',
        title: 'Escrow payment released',
        body: `Escrow for ${escrow.title} was released and ${amountToSeller} FARM credited to your wallet.`,
        entityId: escrow.id,
        metadata: {
          escrow_id: escrow.id,
          amount: Number(escrow.amount),
          net_amount: amountToSeller,
          buyer_id: escrow.buyer_id,
        },
      }),
    ]).catch((error) => this.logger.error('Escrow release notification failed', error));
  }

  async executeRefund(escrow: any) {
    const amount = Number(escrow.amount);
    await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: escrow.buyer_wallet_id },
        data: { locked_balance: { decrement: amount } },
      });
      await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          receiver_wallet_id: escrow.buyer_wallet_id,
          transaction_type: 'escrow_refund',
          status: 'completed',
          amount,
          fee: 0,
          net_amount: amount,
          description: `Escrow refund: ${escrow.title}`,
          metadata: { user_id: escrow.buyer_id, escrow_id: escrow.id },
          processed_at: new Date(),
        },
      });
      await tx.escrow_contracts.update({
        where: { id: escrow.id }, data: { status: 'refunded', resolved_at: new Date() },
      });
    });

    await this.notificationsService.sendNotification(escrow.buyer_id, {
      type: 'escrow_refunded',
      title: 'Escrow refunded',
      body: `Your escrow for ${escrow.title} has been refunded. ${amount} FARM is now unlocked.`,
      entityId: escrow.id,
      metadata: {
        escrow_id: escrow.id,
        amount,
      },
    }).catch((error) => this.logger.error('Escrow refund notification failed', error));
  }

  private async getEscrowOrFail(id: string) {
    const e = await this.prisma.escrow_contracts.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Escrow contract not found');
    return e;
  }
}