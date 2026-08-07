import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from './ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IvorypayDepositService {
  private readonly logger = new Logger(IvorypayDepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ivorypayService: IvorypayService,
    private readonly notificationsService: NotificationsService,
    private readonly websocket: WebsocketGateway,
  ) {}

  async createDeposit(userId: string, dto: any) {
    const amount = Number(dto.amount_fiat);
    if (!Number.isFinite(amount) || amount < 10) {
      throw new BadRequestException(`Invalid deposit amount. Minimum deposit is 10 ${dto.currency || 'KES'}`);
    }

    const reference = uuidv4();
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount,
        fee: 0,
        total: amount,
        currency: 'FARM',
        paymentMethod: 'CRYPTO',
        provider: 'ivorypay',
        reference,
        status: 'PENDING',
        providerRef: null,
      },
    });

    const amountUsd = Number((amount / 130).toFixed(2));
    const init = await this.ivorypayService.createPayment({
      amount: amountUsd,
      currency: 'USD',
      reference,
      email: dto.email || `${userId}@farm.app`,
      description: `Farm deposit ${amount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
      baseFiat: 'USD',
      metadata: {
        provider: 'ivorypay',
        amount_farm: amount,
        amount_usd: amountUsd,
        currency_fiat: 'USD',
        user_id: userId,
        payment_method: 'CRYPTO',
      },
    });

    const providerPayload = init;
    const providerIdentifiers = this.extractIvorypayProviderIdentifiers(providerPayload);
    const responseIdentifiers = (init as any)?.providerIdentifiers ?? {};
    const responseProviderReference = typeof (init as any)?.providerReference === 'string' && (init as any)?.providerReference?.trim()
      ? (init as any).providerReference.trim()
      : null;
    const hasExplicitProviderReference = !!(
      responseIdentifiers?.provider_reference ||
      responseIdentifiers?.providerReference ||
      (init as any)?.data?.provider_reference ||
      (init as any)?.data?.providerReference ||
      (init as any)?.provider_reference ||
      (init as any)?.providerReference
    );
    Object.entries(responseIdentifiers).forEach(([key, value]) => {
      const normalizedKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (value != null && value !== '' && providerIdentifiers[normalizedKey] == null) {
        const mappedKey = this.mapIdentifierKey(normalizedKey);
        if (mappedKey) {
          providerIdentifiers[mappedKey] = value;
        }
      }
    });
    const providerTransactionId =
      providerIdentifiers.transaction_id ??
      providerIdentifiers.payment_id ??
      providerIdentifiers.id ??
      providerIdentifiers.provider_reference ??
      providerIdentifiers.tx_ref ??
      providerIdentifiers.trxref ??
      providerIdentifiers.transaction_reference ??
      providerIdentifiers.checkout_id ??
      providerIdentifiers.payment_reference ??
      providerIdentifiers.merchant_reference ??
      providerIdentifiers.order_id ??
      null;
    const providerRef =
      responseProviderReference ??
      providerTransactionId ??
      providerIdentifiers.provider_reference ??
      providerIdentifiers.payment_id ??
      providerIdentifiers.checkout_id ??
      providerIdentifiers.tx_ref ??
      providerIdentifiers.trxref ??
      providerIdentifiers.transaction_reference ??
      providerIdentifiers.payment_reference ??
      providerIdentifiers.merchant_reference ??
      providerIdentifiers.order_id ??
      null;
    const providerReference =
      (hasExplicitProviderReference ? (responseIdentifiers.provider_reference ?? responseIdentifiers.providerReference ?? (init as any)?.data?.provider_reference ?? (init as any)?.data?.providerReference ?? (init as any)?.provider_reference ?? (init as any)?.providerReference ?? null) : null) ??
      providerIdentifiers.provider_reference ??
      providerIdentifiers.reference ??
      providerIdentifiers.payment_reference ??
      providerIdentifiers.merchant_reference ??
      null;
    const checkoutId = providerIdentifiers.checkout_id ?? null;
    const paymentReference =
      providerIdentifiers.payment_reference ??
      providerIdentifiers.reference ??
      providerIdentifiers.transaction_reference ??
      init.data?.reference ??
      init.data?.tx_ref ??
      init.data?.trxref ??
      null;
    const merchantReference = providerIdentifiers.merchant_reference ?? null;

    this.logger.log(`Ivorypay checkout response for reference=${reference}: ${JSON.stringify(providerPayload, null, 2)}`);

    if (!providerTransactionId && !providerRef && !providerReference && !checkoutId && !paymentReference) {
      this.logger.warn(
        `Ivorypay checkout created without provider identifiers for reference=${reference}. ` +
        `providerIdentifiers=${JSON.stringify(providerIdentifiers)} ` +
        `Expecting transactionId/paymentId/checkoutId/paymentReference/merchantReference/orderId. ` +
        `The deposit will be completed from the webhook once identifiers arrive.`,
      );
    }

    const hasProviderIdentifiers = !!(providerTransactionId || providerRef || providerReference || checkoutId || paymentReference || merchantReference);
    if (hasProviderIdentifiers) {
      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          providerRef: providerRef ?? null,
          providerTransactionId: providerTransactionId ?? null,
          providerReference: providerReference ?? null,
          checkoutId,
          paymentReference,
          merchantReference,
          providerPayload,
        },
      });
    }

    await this.prisma.transactions.create({
      data: {
        transaction_reference: reference,
        transaction_type: 'deposit',
        status: 'pending',
        amount,
        fee: 0,
        net_amount: amount,
        currency: 'FARM',
        description: `Pending crypto deposit via Ivorypay (${amount} FARM → ${amountUsd} USD)`,
        metadata: {
          provider: 'ivorypay',
          provider_ref: providerTransactionId,
          provider_transaction_id: providerIdentifiers.transaction_id ?? null,
          provider_payment_id: providerIdentifiers.payment_id ?? null,
          provider_checkout_id: providerIdentifiers.checkout_id ?? null,
          provider_reference: providerIdentifiers.provider_reference ?? null,
          tx_ref: providerIdentifiers.tx_ref ?? null,
          trxref: providerIdentifiers.trxref ?? null,
          transaction_reference: providerIdentifiers.transaction_reference ?? null,
          amount_farm: amount,
          amount_usd: amountUsd,
          currency_fiat: 'USD',
          user_id: userId,
          payment_method: 'CRYPTO',
        },
      },
    });

    this.logger.log(`IvoryPay deposit created: reference=${reference} user=${userId}`);

    return {
      success: true,
      data: {
        reference,
        payment_url: init.data?.payment_link || init.payment_link || init.checkout_url,
        authorization_url: init.data?.payment_link || init.payment_link || init.checkout_url,
      },
      message: 'Crypto deposit initiated via IvoryPay',
    };
  }

  async getStatus(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    if (!deposit) {
      throw new BadRequestException('Deposit not found');
    }
    return { success: true, data: { reference, status: deposit.status, provider: deposit.provider } };
  }

  async handleWebhook(payload: any, verified = false) {
    const reference = this.resolveReference(payload);
    if (!reference) {
      this.logger.warn('IvoryPay webhook received without reference');
      throw new BadRequestException('Missing IvoryPay reference');
    }

    this.logger.log(`IvoryPay webhook received: reference=${reference} event=${payload.event ?? payload.status}`);
    if (!verified) {
      this.logger.warn(`IvoryPay webhook verification skipped for ${reference}`);
      throw new BadRequestException('Signature verification required');
    }

    const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    if (!deposit || !transaction) {
      this.logger.warn(`IvoryPay webhook ignored: deposit/transaction not found for ${reference}`);
      return { processed: false, reason: 'not_found' };
    }

    // If the IvoryPay webhook provides the provider's transaction id, persist it
    // so subsequent verification or stuck-deposit fixes use the provider's id
    // rather than our internal reference.
    try {
        const providerId = [
        payload?.data?.id,
        payload?.data?.transaction_id,
        payload?.data?.payment_id,
        payload?.data?.tx_ref,
        payload?.data?.trxref,
        payload?.data?.transaction_reference,
        payload?.data?.provider_reference,
        payload?.data?.reference,
        payload?.id,
      ].find((value) => value !== undefined && value !== null && value !== '');
      if (providerId) {
        const metadata = (transaction.metadata as any) ?? {};
        const providerReference = payload?.data?.provider_reference ?? metadata.provider_reference ?? null;
        const providerTransactionId =
          payload?.data?.transaction_id ??
          payload?.data?.payment_id ??
          payload?.data?.id ??
          providerId;
        const depositUpdate: any = {
          providerRef: providerId,
          providerTransactionId,
          providerReference,
          providerPayload: payload ?? metadata.providerPayload ?? null,
          webhookReceived: new Date(),
        };

        await this.prisma.$transaction(async (tx) => {
          await tx.deposit.update({ where: { id: deposit.id }, data: depositUpdate });
          await tx.transactions.update({ where: { id: transaction.id }, data: { metadata: { ...metadata, provider_ref: providerId } } });
        });

        deposit.providerRef = providerId;
        transaction.metadata = { ...(transaction.metadata as Record<string, any>), provider_ref: providerId };
        this.logger.log(`IvoryPay webhook: synced provider id ${providerId} into deposit and transaction for ${reference}`);
      } else if (!deposit.providerRef || !deposit.providerPayload) {
        // mark that we received webhook even if no provider id found
        try {
          await this.prisma.deposit.update({ where: { id: deposit.id }, data: { webhookReceived: new Date(), providerPayload: payload ?? deposit.providerPayload ?? null } });
        } catch (uErr) {
          this.logger.debug('IvoryPay webhook: failed to set webhookReceived', uErr as any);
        }
      }
    } catch (e) {
      this.logger.debug(`IvoryPay webhook: failed to sync provider id for ${reference}`, e as any);
    }

    const depositStatus = deposit.status?.toString().toUpperCase();
    const txStatus = transaction.status?.toString().toLowerCase();
    const isSuccess = this.isSuccess(payload);
    const isFailure = this.isFailure(payload);

    if (depositStatus === 'SUCCESS' || txStatus === 'completed') {
      this.logger.log(`IvoryPay duplicate webhook ignored for ${reference}`);
      return { processed: true, duplicate: true, reference };
    }

    if (!isSuccess && !isFailure) {
      this.logger.log(`IvoryPay webhook ignored for ${reference}: unsupported event`);
      return { processed: false, reason: 'unsupported_event' };
    }

    if (isFailure) {
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'FAILED' } });
      await this.prisma.transactions.update({ where: { id: transaction.id }, data: { status: 'failed' } });
      this.logger.warn(`IvoryPay deposit marked failed: reference=${reference}`);
      return { processed: true, reference, status: 'failed' };
    }

    const verificationResult = await this.verifyDepositWithIvorypay(reference, deposit, transaction, payload);
    const verificationAttempts = (deposit.verificationAttempts ?? 0) + 1;
    const verificationUpdateData: any = {
      verificationAttempts,
      verificationPayload: verificationResult.verificationPayload,
      blockchainTransactionHash: verificationResult.blockchainTransactionHash ?? null,
      webhookReceived: new Date(),
    };

    if (verificationResult.shouldCredit) {
      verificationUpdateData.verifiedAt = new Date();
    }

    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: verificationUpdateData,
    });

    if (!verificationResult.shouldCredit) {
      this.logger.warn(`IvoryPay verification pending for ${reference}: ${verificationResult.reason}`);
      return { processed: false, reason: verificationResult.reason, reference };
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      const currentDeposit = await tx.deposit.findFirst({ where: { reference } });
      if (!currentDeposit) {
        throw new BadRequestException('Deposit missing during IvoryPay processing');
      }
      if (currentDeposit.status === 'SUCCESS') {
        return { alreadyProcessed: true };
      }

      let wallet = await tx.wallets.findFirst({ where: { user_id: currentDeposit.userId, is_active: true } });
      if (!wallet) {
        wallet = await tx.wallets.create({
          data: {
            user_id: currentDeposit.userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: currentDeposit.currency || 'FARM',
          },
        });
      }

      const previousBalance = Number(wallet.balance ?? 0);
      const creditAmount = Number(currentDeposit.amount ?? transaction.amount ?? 0);

      const now = new Date();
      await tx.deposit.update({ where: { id: currentDeposit.id }, data: { status: 'SUCCESS', verifiedAt: now, creditedAt: now } });
      await tx.wallets.update({ where: { id: wallet.id }, data: { balance: { increment: creditAmount } } });
      await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'completed', receiver_wallet_id: wallet.id, processed_at: new Date() } });
      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: creditAmount,
          balance_before: previousBalance,
          balance_after: previousBalance + creditAmount,
          description: `Deposit completed — ref: ${reference}`,
        },
      });
      await tx.audit_logs.create({
        data: {
          user_id: currentDeposit.userId,
          action: 'deposit_completed',
          entity_type: 'deposit',
          entity_id: currentDeposit.id,
          new_values: { reference, provider: 'ivorypay', amount: creditAmount },
        },
      });

      return { alreadyProcessed: false, wallet, previousBalance, creditAmount };
    });

    if ((result as any).alreadyProcessed) {
      this.logger.log(`IvoryPay duplicate webhook ignored for ${reference}`);
      return { processed: true, duplicate: true, reference };
    }

    await this.notificationsService.sendNotification(deposit.userId, {
      type: 'deposit_completed',
      title: 'Deposit completed',
      body: `Your crypto deposit of ${Number(deposit.amount ?? 0)} FARM has been credited to your wallet.`,
      entityId: deposit.id,
      metadata: { provider: 'ivorypay', reference },
    });

    this.websocket.emitBalanceUpdate(deposit.userId, ((result as any).previousBalance ?? 0) + ((result as any).creditAmount ?? 0));
    this.websocket.emitTransactionUpdate(deposit.userId, { reference, status: 'SUCCESS' });

    this.logger.log(`IvoryPay wallet credited: reference=${reference} amount=${(result as any).creditAmount}`);
    return { processed: true, reference, status: 'completed' };
  }

  private async verifyDepositWithIvorypay(reference: string, deposit: any, transaction: any, payload: any) {
    const transactionMetadata = (transaction?.metadata as any) ?? {};
    const providerReference = deposit?.providerTransactionId ?? deposit?.providerRef ?? deposit?.providerReference ?? transactionMetadata.provider_ref ?? transactionMetadata.provider_transaction_id ?? transactionMetadata.provider_reference ?? null;
    const candidates = [
      payload?.id,
      payload?.data?.id,
      payload?.data?.transaction_id,
      payload?.data?.payment_id,
      payload?.data?.tx_ref,
      payload?.data?.trxref,
      payload?.data?.transaction_reference,
      payload?.data?.provider_reference,
      payload?.data?.reference,
      payload?.reference,
      deposit?.providerRef,
      deposit?.providerTransactionId,
      deposit?.providerReference,
      transactionMetadata.provider_ref,
      transactionMetadata.provider_transaction_id,
      transactionMetadata.provider_reference,
      transactionMetadata.tx_ref,
      transactionMetadata.trxref,
      transactionMetadata.transaction_reference,
    ]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => value?.toString?.().trim())
      .filter((value, index, self) => !!value && self.indexOf(value) === index);

    try {
      const verifiedTransaction = await this.ivorypayService.verifyTransaction(reference, providerReference, candidates);
      const normalizedStatus = (verifiedTransaction?.status ?? verifiedTransaction?.data?.status ?? payload?.data?.status ?? payload?.status ?? '').toString().toLowerCase();
      const expectedAmount = Number(deposit?.amount ?? transaction?.amount ?? 0);
      const verifiedAmount = Number(verifiedTransaction?.amount ?? verifiedTransaction?.data?.amount ?? verifiedTransaction?.amount_usd ?? verifiedTransaction?.amount_fiat ?? transaction?.amount ?? deposit?.amount ?? 0);
      const verifiedProviderId = verifiedTransaction?.providerReference ?? verifiedTransaction?.providerIdentifiers?.transaction_id ?? verifiedTransaction?.providerIdentifiers?.id ?? verifiedTransaction?.providerIdentifiers?.provider_reference ?? verifiedTransaction?.providerIdentifiers?.tx_ref ?? verifiedTransaction?.providerIdentifiers?.trxref ?? verifiedTransaction?.providerIdentifiers?.transaction_reference ?? null;
      const txHash = verifiedTransaction?.tx_hash ?? verifiedTransaction?.transaction_hash ?? verifiedTransaction?.hash ?? verifiedTransaction?.data?.tx_hash ?? verifiedTransaction?.data?.transaction_hash ?? verifiedTransaction?.data?.hash ?? payload?.data?.tx_hash ?? payload?.tx_hash ?? null;

      if (!['success', 'completed'].includes(normalizedStatus)) {
        return { shouldCredit: false, reason: 'verification_pending', verificationPayload: verifiedTransaction ?? payload, blockchainTransactionHash: txHash ?? null };
      }

      if (expectedAmount > 0 && verifiedAmount > 0 && Math.abs(verifiedAmount - expectedAmount) > 0.01) {
        return { shouldCredit: false, reason: 'amount_mismatch', verificationPayload: verifiedTransaction ?? payload, blockchainTransactionHash: txHash ?? null };
      }

      if (providerReference && verifiedProviderId && verifiedProviderId !== providerReference) {
        return { shouldCredit: false, reason: 'provider_id_mismatch', verificationPayload: verifiedTransaction ?? payload, blockchainTransactionHash: txHash ?? null };
      }

      return { shouldCredit: true, reason: 'verified', verificationPayload: verifiedTransaction ?? payload, blockchainTransactionHash: txHash ?? null };
    } catch (error) {
      this.logger.warn(`IvoryPay verification failed for ${reference}: ${error instanceof Error ? error.message : String(error)}`);
      return { shouldCredit: false, reason: 'verification_failed', verificationPayload: payload, blockchainTransactionHash: null };
    }
  }

  private mapIdentifierKey(normalizedKey: string) {
    if (['transactionid', 'transaction_id', 'txnid', 'txn_id'].includes(normalizedKey)) return 'transaction_id';
    if (normalizedKey === 'paymentid' || normalizedKey === 'payment_id') return 'payment_id';
    if (normalizedKey === 'checkoutid' || normalizedKey === 'checkout_id') return 'checkout_id';
    if (normalizedKey === 'providerreference' || normalizedKey === 'provider_reference') return 'provider_reference';
    if (normalizedKey === 'paymentreference' || normalizedKey === 'payment_reference') return 'payment_reference';
    if (normalizedKey === 'merchantreference' || normalizedKey === 'merchant_reference') return 'merchant_reference';
    if (normalizedKey === 'orderid' || normalizedKey === 'order_id') return 'order_id';
    if (normalizedKey === 'txref' || normalizedKey === 'tx_ref') return 'tx_ref';
    if (normalizedKey === 'trxref' || normalizedKey === 'trx_ref') return 'trxref';
    if (normalizedKey === 'transactionreference' || normalizedKey === 'transaction_reference') return 'transaction_reference';
    if (normalizedKey === 'reference') return 'reference';
    if (normalizedKey === 'id') return 'id';
    return null;
  }

  private extractIvorypayProviderIdentifiers(payload: any) {
    const identifiers: Record<string, any> = {
      transaction_id: null,
      payment_id: null,
      checkout_id: null,
      provider_reference: null,
      tx_ref: null,
      trxref: null,
      transaction_reference: null,
      payment_reference: null,
      merchant_reference: null,
      order_id: null,
      reference: null,
      id: null,
    };

    const normalizeKey = (key: string) => key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchKey = (key: string) => this.mapIdentifierKey(normalizeKey(key));

    const scan = (node: any) => {
      if (node === null || node === undefined) return;
      if (Array.isArray(node)) {
        node.forEach(scan);
        return;
      }
      if (typeof node !== 'object') return;

      for (const [key, value] of Object.entries(node)) {
        const mapped = matchKey(key);
        if (mapped && identifiers[mapped] == null && value != null && value !== '') {
          identifiers[mapped] = value;
        }
        if (typeof value === 'object' && value !== null) {
          scan(value);
        }
      }
    };

    scan(payload);
    return identifiers;
  }

  private resolveReference(payload: any): string | null {
    const value =
      payload?.reference ??
      payload?.data?.reference ??
      payload?.data?.tx_ref ??
      payload?.data?.trxref ??
      payload?.data?.transaction_reference ??
      payload?.data?.transactionReference ??
      payload?.data?.provider_reference ??
      payload?.data?.payment_id ??
      payload?.data?.transaction_id ??
      payload?.id;
    return typeof value === 'string' && value.trim() ? value.trim() : value?.toString?.().trim() || null;
  }

  private isSuccess(payload: any) {
    const event = payload?.event?.toString().toLowerCase() || '';
    const status = payload?.status?.toString().toLowerCase() || payload?.data?.status?.toString().toLowerCase() || '';
    return ['payment.success', 'transaction.completed', 'success', 'completed'].includes(event) || ['success', 'completed'].includes(status);
  }

  private isFailure(payload: any) {
    const event = payload?.event?.toString().toLowerCase() || '';
    const status = payload?.status?.toString().toLowerCase() || payload?.data?.status?.toString().toLowerCase() || '';
    return ['payment.failed', 'transaction.failed', 'failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'].includes(event) || ['failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'].includes(status);
  }
}
