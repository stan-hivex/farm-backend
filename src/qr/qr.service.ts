import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { generateTxReference } from '../common/utils/reference.util';

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private cfg: ConfigService,
  ) {}

  async generateMerchantQr(merchantId: string) {
    const merchant = await this.prisma.merchants.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const payload = { merchant_id: merchantId, business_name: merchant.business_name, v: 1 };
    const payloadStr = JSON.stringify(payload);
    const sig = this.sign(payloadStr, merchant.qr_secret || this.cfg.get('QR_HMAC_SECRET', ''));
    const signed = JSON.stringify({ ...payload, sig });
    const qr_image = await QRCode.toDataURL(signed);
    await this.prisma.merchants.update({ where: { id: merchantId }, data: { qr_code: signed } });
    return { data: { qr_payload: signed, qr_image_base64: qr_image } };
  }

  async getMerchantQr(merchantId: string) {
    const merchant = await this.prisma.merchants.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (!merchant.qr_code) {
      return this.generateMerchantQr(merchantId);
    }
    const qr_image = await QRCode.toDataURL(merchant.qr_code);
    return { data: { qr_payload: merchant.qr_code, qr_image_base64: qr_image } };
  }

  async generateReceiveQr(userId: string, amount?: number) {
    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const payload = JSON.stringify({
      wallet_address: wallet.wallet_address, amount: amount || null, v: 1,
    });
    const qr_image = await QRCode.toDataURL(payload);
    return { data: { qr_payload: payload, qr_image_base64: qr_image } };
  }

  async validate(scannedPayload: string, customerId: string) {
    let parsed: any;

    try {
      parsed = JSON.parse(scannedPayload);
    } catch {
      const identifier = scannedPayload.trim();
      if (!identifier) throw new BadRequestException('Invalid QR payload');

      const normalizedUsername = identifier.startsWith('@')
        ? identifier.substring(1).trim().toLowerCase()
        : identifier.toLowerCase();

      const user = await this.prisma.users.findFirst({
        where: {
          OR: [
            { username: normalizedUsername },
            { phone: identifier },
          ],
        },
        include: {
          wallets: {
            where: { is_active: true },
            take: 1,
          },
        },
      });

      if (!user || !user.wallets?.length) {
        throw new BadRequestException('User not found or wallet unavailable');
      }

      return {
        data: {
          valid: true,
          type: 'peer',
          wallet_address: user.wallets[0].wallet_address,
          suggested_amount: null,
        },
      };
    }

    if (parsed.merchant_id) {
      const merchant = await this.prisma.merchants.findUnique({ where: { id: parsed.merchant_id } });
      if (!merchant || merchant.status !== 'approved')
        throw new BadRequestException('Merchant not found or not approved');
      const { sig, ...data } = parsed;
      const expected = this.sign(
        JSON.stringify(data),
        merchant.qr_secret || this.cfg.get('QR_HMAC_SECRET', ''),
      );
      if (sig !== expected) throw new BadRequestException('QR signature invalid');
      return {
        data: {
          valid: true, type: 'merchant',
          merchant_id: merchant.id, business_name: merchant.business_name,
          fee_percent: Number(merchant.transaction_fee_percent),
          daily_limit: Number(merchant.daily_limit),
        },
      };
    }

    if (parsed.wallet_address) {
      const wallet = await this.prisma.wallets.findUnique({
        where: { wallet_address: parsed.wallet_address },
      });
      if (!wallet) throw new BadRequestException('Invalid wallet address');
      return { data: { valid: true, type: 'peer', wallet_address: parsed.wallet_address, suggested_amount: parsed.amount } };
    }

    throw new BadRequestException('Unknown QR type');
  }

  async merchantPay(customerId: string, dto: { qr_payload: string; amount: number; pin: string }) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    await this.authService.verifyPin(customerId, dto.pin);

    const validation = (await this.validate(dto.qr_payload, customerId)).data;
    if (!validation.valid || validation.type !== 'merchant')
      throw new BadRequestException('Invalid merchant QR');

    const merchant = await this.prisma.merchants.findUnique({
      where: { id: (validation as any).merchant_id },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const customerWallet = await this.prisma.wallets.findFirst({
      where: { user_id: customerId, is_active: true },
    });
    const merchantWallet = await this.prisma.wallets.findFirst({
      where: { user_id: merchant.user_id! },
    });
    if (!customerWallet || !merchantWallet) throw new NotFoundException('Wallet not found');

    const fee = dto.amount * (Number(merchant.transaction_fee_percent) / 100);
    const totalOut = dto.amount + fee;
    const available = Number(customerWallet.balance) - Number(customerWallet.locked_balance);
    if (available < totalOut)
      throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);

    const result = await this.prisma.$transaction(async (tx) => {
      const reference = generateTxReference();
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: reference,
          sender_wallet_id: customerWallet.id,
          receiver_wallet_id: merchantWallet.id,
          transaction_type: 'merchant_payment',
          status: 'completed',
          amount: dto.amount, fee, net_amount: dto.amount - fee,
          currency: 'FARM',
          description: `Payment to ${merchant.business_name}`,
          metadata: { user_id: customerId, merchant_id: merchant.id },
          processed_at: new Date(),
        },
      });
      await tx.wallets.update({
        where: { id: customerWallet.id }, data: { balance: { decrement: totalOut } },
      });
      await tx.wallets.update({
        where: { id: merchantWallet.id }, data: { balance: { increment: dto.amount } },
      });
      // Also credit the platform/main wallet so the application's
      // aggregate/main balance reflects incoming merchant payments.
      // We look for a dedicated platform wallet (wallet_type = 'platform')
      // or fallback to any wallet with no owner (user_id = null) marked active.
      const platformWallet = await tx.wallets.findFirst({
        where: {
          OR: [
            { wallet_type: 'platform', is_active: true },
            { user_id: null, is_active: true },
          ],
        },
      });
      if (platformWallet) {
        // Platform receives only the fee portion, not the full amount.
        await tx.wallets.update({
          where: { id: platformWallet.id },
          data: { balance: { increment: fee } },
        });
      }
      await tx.merchants.update({
        where: { id: merchant.id }, data: { total_sales: { increment: dto.amount } },
      });
      await tx.qr_payments.create({
        data: {
          merchant_id: merchant.id, customer_id: customerId,
          transaction_id: txn.id, qr_payload: dto.qr_payload,
          amount: dto.amount, status: 'completed', scanned_at: new Date(),
        },
      });
      await tx.ledger_entries.createMany({
        data: [
          {
            transaction_id: txn.id, wallet_id: customerWallet.id,
            entry_type: 'debit', amount: totalOut,
            description: `QR payment to ${merchant.business_name}`,
          },
          {
            transaction_id: txn.id, wallet_id: merchantWallet.id,
            entry_type: 'credit', amount: dto.amount,
            description: 'QR payment received',
          },
          // ledger entry for platform/main wallet credit (if present)
          ...(platformWallet ? [{
            transaction_id: txn.id, wallet_id: platformWallet.id,
            entry_type: 'credit', amount: fee,
            description: 'Platform fee from merchant QR payment',
          }] : []),
        ],
      });
      return txn;
    });
    
    return {
      data: { reference: result.transaction_reference, amount: dto.amount, fee, status: 'completed' },
      message: `Payment to ${merchant.business_name} successful`,
    };
  }

  private sign(data: string, secret: string) {
    return createHmac('sha256', secret || 'fallback').update(data).digest('hex');
  }
}