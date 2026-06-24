import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaystackService } from '../paystack/paystack.service';
import { generateEscrowReference, generateTxReference } from '../common/utils/reference.util';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private paystack: PaystackService,
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
    description?: string; auto_release_days?: number; pin: string;
  }) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    await this.authService.verifyPin(buyerId, dto.pin);

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

    return {
      data: { ...contract, amount: Number(contract.amount), fee: Number(contract.fee) },
      message: 'Escrow created and funded',
    };
  }

  async release(escrowId: string, buyerId: string) {
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
  }

  private async getEscrowOrFail(id: string) {
    const e = await this.prisma.escrow_contracts.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Escrow contract not found');
    return e;
  }
}