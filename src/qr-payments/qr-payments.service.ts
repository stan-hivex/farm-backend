import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../common/cache/cache.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaystackService } from '../paystack/paystack.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CreateQrPaymentDto } from './create-qr-payment.dto';

const PUBLIC_PAY_SUCCESS_URL = 'https://farmapp.africa/pay/success';

type QrProvider = 'paystack' | 'ivorypay';

@Injectable()
export class QrPaymentsService {
  private readonly logger = new Logger(QrPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly ivorypay: IvorypayService,
    private readonly currencyConversion: CurrencyConversionService,
    private readonly cache: CacheService,
    private readonly websocket: WebsocketGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async getPublicMerchant(merchantId: string) {
    if (
      merchantId === 'ANYID' ||
      merchantId.length < 10 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        merchantId,
      )
    ) {
      throw new BadRequestException('Invalid merchant ID from QR');
    }

    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
      include: {
        users_merchants_user_idTousers: {
          select: { first_name: true, last_name: true },
        },
      },
    });
    if (!merchant || merchant.status !== 'approved' || !merchant.user_id) {
      throw new NotFoundException(
        'Merchant not found or unable to accept payments',
      );
    }

    const owner = merchant.users_merchants_user_idTousers;
    const ownerName = [owner?.first_name, owner?.last_name]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' ');

    return {
      data: {
        id: merchant.id,
        farmName: merchant.business_name,
        ownerName: ownerName || merchant.business_name,
        avatar: merchant.business_logo,
        qrPayload: merchant.qr_code,
      },
    };
  }

  async initialize(dto: CreateQrPaymentDto) {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: dto.merchantId },
      include: {
        users_merchants_user_idTousers: {
          select: { id: true, email: true },
        },
      },
    });
    if (!merchant || merchant.status !== 'approved' || !merchant.user_id) {
      throw new NotFoundException(
        'Merchant not found or unable to accept payments',
      );
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: {
        user_id: merchant.user_id,
        is_active: true,
        wallet_type: 'user',
      },
    });
    if (!wallet) {
      throw new BadRequestException(
        'This merchant does not have an active wallet',
      );
    }

    const rate = await this.currencyConversion.getCurrentRate();
    const kesPerFarm = Number(rate.farm_kes_rate);
    const farmPerKes =
      Number.isFinite(kesPerFarm) && kesPerFarm > 0 ? 1 / kesPerFarm : NaN;
    const amountFarm = dto.amount * farmPerKes;
    if (!Number.isFinite(amountFarm) || amountFarm <= 0) {
      throw new BadRequestException('The FARM exchange rate is unavailable');
    }

    const provider: QrProvider =
      dto.method === 'crypto' ? 'ivorypay' : 'paystack';
    const reference = `QR-${Date.now()}-${randomUUID()}`;
    const email =
      dto.guestEmail?.trim() ||
      merchant.business_email?.trim() ||
      merchant.users_merchants_user_idTousers?.email?.trim();
    if (!email) {
      throw new BadRequestException(
        'An email address is required for this payment',
      );
    }
    if (dto.method === 'mpesa' && !dto.guestPhone?.startsWith('+')) {
      throw new BadRequestException(
        'Enter the M-Pesa phone number with its country code',
      );
    }

    let amountUsd: number | undefined;
    let crypto = dto.crypto;
    let chain = dto.chain;
    if (provider === 'ivorypay') {
      crypto = crypto ?? 'USDT';
      const networks = this.ivorypay.getProviderNetworks(crypto).networks;
      if (!networks.includes(chain ?? '')) {
        throw new BadRequestException(
          'The selected crypto network is not enabled for IvoryPay',
        );
      }
      const farmUsdRate = Number(rate.farm_usd_rate);
      if (!Number.isFinite(farmUsdRate) || farmUsdRate <= 0) {
        throw new BadRequestException(
          'The FARM/USD exchange rate is unavailable',
        );
      }
      amountUsd = Number((amountFarm * farmUsdRate).toFixed(2));
      if (!chain) {
        throw new BadRequestException(
          'Choose a network for the crypto payment',
        );
      }
    }

    const metadata: Prisma.InputJsonObject = {
      type: 'qr_sale',
      isQrSale: true,
      qr_guest_payment: true,
      merchant_id: merchant.id,
      merchantId: merchant.id,
      originalReference: reference,
      provider,
      provider_ref: reference,
      amount_fiat: dto.amount,
      amount_kes: dto.amount,
      amount_farm: amountFarm,
      currency_fiat: 'KES',
      user_id: merchant.user_id,
      payment_method: dto.method,
      guest_email: email,
      guest_phone: dto.guestPhone ?? null,
      ...(amountUsd !== undefined ? { amount_usd: amountUsd } : {}),
      ...(crypto ? { crypto } : {}),
      ...(chain ? { chain } : {}),
    };

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transactions.create({
        data: {
          transaction_reference: reference,
          receiver_wallet_id: wallet.id,
          transaction_type: 'merchant_payment',
          status: 'pending',
          amount: amountFarm,
          fee: 0,
          net_amount: amountFarm,
          currency: 'FARM',
          description: `Pending public QR payment to ${merchant.business_name}`,
          exchange_rate: farmPerKes,
          metadata,
        },
      });
      await tx.qr_payments.create({
        data: {
          merchant_id: merchant.id,
          transaction_id: created.id,
          qr_payload: merchant.qr_code,
          amount: amountFarm,
          status: 'pending',
          scanned_at: new Date(),
        },
      });
      return created;
    });

    try {
      const callbackUrl = `${PUBLIC_PAY_SUCCESS_URL}?reference=${encodeURIComponent(reference)}`;
      let paymentUrl: string | undefined;
      let providerReference = reference;

      if (provider === 'paystack') {
        const channels =
          dto.method === 'mpesa'
            ? ['mobile_money']
            : dto.method === 'bank'
              ? ['bank']
              : ['card'];
        const initialized = await this.paystack.initializePayment({
          email,
          amount: dto.amount,
          currency: 'KES',
          reference,
          channels,
          ...(dto.guestPhone ? { phone: dto.guestPhone } : {}),
          callback_url: callbackUrl,
          metadata: {
            type: 'qr_sale',
            merchantId: merchant.id,
            originalReference: reference,
            isQrSale: true,
          },
        });
        paymentUrl =
          initialized.authorization_url ?? initialized.authorizationUrl;
      } else {
        const initialized = await this.ivorypay.createPayment({
          amount: amountUsd,
          currency: 'USD',
          reference,
          email,
          description: `QR merchant payment to ${merchant.business_name}`,
          baseFiat: 'USD',
          crypto,
          chain,
          redirect_url: callbackUrl,
          metadata: {
            type: 'qr_sale',
            merchantId: merchant.id,
            originalReference: reference,
            isQrSale: true,
            amount_kes: dto.amount,
            amount_farm: amountFarm,
            amount_usd: amountUsd,
          },
        });
        paymentUrl = initialized.payment_link;
        providerReference =
          initialized.providerTransactionId ??
          initialized.providerReference ??
          reference;
      }

      if (!paymentUrl || !/^https:\/\//i.test(paymentUrl)) {
        throw new BadRequestException(
          'The payment provider did not return a valid checkout URL',
        );
      }

      await this.prisma.transactions.update({
        where: { id: transaction.id },
        data: {
          metadata: {
            ...metadata,
            provider_ref: providerReference,
            ...(provider === 'ivorypay'
              ? { provider_reference: providerReference }
              : {}),
          } as Prisma.InputJsonObject,
        },
      });

      this.logger.log(
        `QR payment initialized ref=${reference} provider=${provider}`,
      );
      return {
        data: {
          reference,
          authorization_url: paymentUrl,
          payment_url: paymentUrl,
          business_name: merchant.business_name,
        },
      };
    } catch (error) {
      await this.markFailed(
        reference,
        'Payment provider initialization failed',
      );
      throw error;
    }
  }

  async verify(reference: string) {
    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      include: { qr_payments: { take: 1 } },
    });
    const metadata =
      (transaction?.metadata as Record<string, unknown> | null) ?? {};
    if (
      !transaction ||
      metadata.type !== 'qr_sale' ||
      metadata.isQrSale !== true
    ) {
      throw new NotFoundException('Merchant QR payment was not found');
    }

    if (transaction.status === 'pending') {
      const provider = metadata.provider as QrProvider | undefined;
      if (provider === 'paystack') {
        const verified = await this.paystack.verifyTransaction(reference);
        if (verified?.status?.toString().toLowerCase() === 'success') {
          await this.complete(reference, 'paystack', verified);
        } else if (
          ['failed', 'abandoned', 'reversed'].includes(
            verified?.status?.toString().toLowerCase() ?? '',
          )
        ) {
          await this.markFailed(reference, 'Payment provider reported failure');
        }
      } else if (provider === 'ivorypay') {
        const verified = await this.ivorypay.verifyTransaction(
          reference,
          String(metadata.provider_ref ?? ''),
          [reference],
        );
        const status = verified?.status?.toString().toLowerCase();
        if (['success', 'completed'].includes(status ?? '')) {
          await this.complete(reference, 'ivorypay', verified);
        } else if (
          ['failed', 'cancelled', 'expired', 'reversed'].includes(status ?? '')
        ) {
          await this.markFailed(reference, 'Payment provider reported failure');
        }
      }
    }

    const current = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      select: { id: true, status: true },
    });
    const qrPayment = current
      ? await this.prisma.qr_payments.findFirst({
          where: { transaction_id: current.id },
          select: { merchant_id: true },
        })
      : null;
    const merchant = qrPayment?.merchant_id
      ? await this.prisma.merchants.findUnique({
          where: { id: qrPayment.merchant_id },
          select: { business_name: true },
        })
      : null;
    const status = current?.status?.toLowerCase();

    return {
      data: {
        status:
          status === 'completed'
            ? 'completed'
            : ['failed', 'cancelled', 'reversed'].includes(status ?? '')
              ? 'failed'
              : 'pending',
        business_name: merchant?.business_name ?? 'Merchant',
        amount: Number(metadata.amount_fiat ?? 0),
        currency: 'KES',
      },
    };
  }

  async complete(
    reference: string,
    provider: QrProvider,
    verifiedPayment: Record<string, any>,
  ) {
    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      include: { qr_payments: { take: 1 } },
    });
    const metadata =
      (transaction?.metadata as Record<string, unknown> | null) ?? {};
    if (
      !transaction ||
      metadata.type !== 'qr_sale' ||
      metadata.isQrSale !== true ||
      metadata.provider !== provider
    ) {
      this.logger.warn(
        `QR settlement ignored ref=${reference} provider=${provider}: payment not found`,
      );
      return false;
    }

    if (provider === 'paystack') {
      const expectedKobo = Math.round(Number(metadata.amount_fiat) * 100);
      if (
        verifiedPayment.status?.toString().toLowerCase() !== 'success' ||
        verifiedPayment.reference !== reference ||
        !Number.isFinite(Number(verifiedPayment.amount)) ||
        Number(verifiedPayment.amount) !== expectedKobo
      ) {
        this.logger.warn(
          `Paystack QR verification did not match ref=${reference}`,
        );
        return false;
      }
    } else {
      const status = verifiedPayment.status?.toString().toLowerCase();
      if (!['success', 'completed'].includes(status ?? '')) {
        this.logger.warn(
          `IvoryPay QR verification did not confirm success ref=${reference}`,
        );
        return false;
      }
      const verifiedUsd = Number(
        verifiedPayment.amount_usd ?? verifiedPayment.amount ?? NaN,
      );
      const expectedUsd = Number(metadata.amount_usd);
      if (
        Number.isFinite(verifiedUsd) &&
        Number.isFinite(expectedUsd) &&
        Math.abs(verifiedUsd - expectedUsd) > 0.5
      ) {
        this.logger.error(
          `IvoryPay QR amount mismatch ref=${reference} expected=${expectedUsd} received=${verifiedUsd}`,
        );
        return false;
      }
    }

    const qrPayment = transaction.qr_payments[0];
    if (!qrPayment?.merchant_id || !transaction.receiver_wallet_id) {
      this.logger.error(
        `QR payment is missing its merchant or wallet ref=${reference}`,
      );
      return false;
    }
    const merchantId = qrPayment.merchant_id;
    const walletId = transaction.receiver_wallet_id;

    const settled = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.transactions.updateMany({
        where: { id: transaction.id, status: 'pending' },
        data: { status: 'completed', processed_at: new Date() },
      });
      if (claim.count !== 1) return null;

      const wallet = await tx.wallets.findUnique({
        where: { id: walletId },
        select: { id: true, user_id: true, balance: true },
      });
      if (!wallet?.user_id) {
        throw new BadRequestException('Merchant wallet is unavailable');
      }
      const amount = Number(transaction.amount);
      const balanceBefore = Number(wallet.balance ?? 0);
      const updatedWallet = await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
        select: { balance: true },
      });
      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount,
          balance_before: balanceBefore,
          balance_after: Number(updatedWallet.balance),
          description: 'Public QR merchant payment received',
        },
      });
      const completedPayment = await tx.qr_payments.updateMany({
        where: {
          transaction_id: transaction.id,
          merchant_id: merchantId,
          status: 'pending',
        },
        data: { status: 'completed' },
      });
      if (completedPayment.count !== 1) {
        throw new BadRequestException(
          'QR payment state changed during settlement',
        );
      }
      await tx.merchants.update({
        where: { id: merchantId },
        data: { total_sales: { increment: amount } },
      });
      return {
        userId: wallet.user_id,
        balance: Number(updatedWallet.balance),
        amount,
        merchantId,
      };
    });

    if (!settled) {
      this.logger.log(
        `QR payment already finalized or no longer pending ref=${reference}`,
      );
      return false;
    }

    try {
      this.websocket.emitBalanceUpdate(settled.userId, settled.balance);
      this.websocket.emitTransactionUpdate(settled.userId, {
        reference,
        status: 'SUCCESS',
      });
    } catch (error) {
      this.logger.error(
        `QR payment realtime update failed ref=${reference}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const cacheInvalidation = this.cache
      .invalidateWallet(settled.userId)
      .catch((error) => {
        this.logger.error(
          `QR payment wallet cache invalidation failed ref=${reference}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    const notificationDelivery = this.notifications
      .sendNotification(settled.userId, {
        type: 'merchant',
        entityId: reference,
        title: 'Merchant payment received',
        body: `Your business received ${settled.amount} FARM from a QR payment.`,
        metadata: {
          event: 'merchant_payment_received',
          merchant_id: settled.merchantId,
          amount: settled.amount,
          currency: 'FARM',
          reference,
        },
      })
      .catch((error) => {
        this.logger.error(
          `Could not notify merchant owner about QR payment ${reference}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    await Promise.all([cacheInvalidation, notificationDelivery]);

    this.logger.log(
      `QR payment credited ref=${reference} merchant=${settled.merchantId}`,
    );
    return true;
  }

  async markFailed(reference: string, reason: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.transactions.findUnique({
        where: { transaction_reference: reference },
        select: { id: true },
      });
      if (!existing) return false;
      const transaction = await tx.transactions.updateMany({
        where: {
          id: existing.id,
          status: 'pending',
        },
        data: { status: 'failed', processed_at: new Date() },
      });
      if (transaction.count !== 1) return false;
      await tx.qr_payments.updateMany({
        where: { transaction_id: existing.id, status: 'pending' },
        data: { status: 'failed' },
      });
      return true;
    });
    if (updated) {
      this.logger.warn(`QR payment failed ref=${reference}: ${reason}`);
    }
    return updated;
  }
}
