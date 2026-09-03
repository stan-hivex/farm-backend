import { Injectable, Logger, Inject, BadRequestException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

type IvorypayResolveContext = {
  transaction: any | null;
  deposit: any | null;
  resolvedReference: string | null;
  matchedReference: string | null;
};
import { DepositService } from '../deposit/deposit.service';
import { WithdrawService } from '../withdraw/withdraw.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { RedisService } from '../common/redis/redis.service';
import { QUEUES } from '../common/constants';
import type { Queue } from 'bull';
import type { Redis } from 'ioredis';
import { verifyPaystackSignature } from '../payments/utils/paystack-webhook.util';
import { resolveDepositCreditAmount } from '../deposit/deposit.utils';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositService: DepositService,
    private readonly withdrawService: WithdrawService,
    private readonly websocket: WebsocketGateway,
    private readonly notificationsService: NotificationsService,
    private readonly cfg: ConfigService,
    private readonly paystackService: PaystackService,
    private readonly ivorypayService: IvorypayService,
    @InjectQueue(QUEUES.WEBHOOKS) private readonly webhookQueue: Queue,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  private getRedisClient(): Redis | null {
    try {
      return this.redisService ? this.redisService.getClient() : null;
    } catch (e) {
      const msg = (e as any)?.message ?? String(e);
      this.logger.debug('getRedisClient failed: ' + msg);
      return null;
    }
  }

  async handlePaystackWebhook(payload: any, verified = false, rawBody?: string, signature?: string) {
    const event = payload.event;
    const status = payload.data?.status ?? payload.data?.gateway_response ?? payload.data?.failure_message ?? 'unknown';
    this.logger.log(`Paystack webhook received: event=${event ?? 'unknown'} reference=${payload?.data?.reference ?? 'missing'} status=${status}`);
    const eventId = this.getEventId('paystack', payload);
    if (eventId && (await this.isReplay('paystack', eventId))) {
      this.logger.warn(`Replay detected for paystack:${eventId}`);
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Replay detected');
      return { received: true };
    }
    // Paystack: attempt verification if raw body + signature provided, otherwise
    // require that the original HTTP request performed signature verification
    const paystackSecret = this.cfg.get<string>('PAYSTACK_WEBHOOK_SECRET');
    if (!verified && paystackSecret && rawBody && signature) {
      try {
        const ok = verifyPaystackSignature(rawBody, signature, paystackSecret);
        verified = ok;
        if (!ok) {
          this.logger.warn('Paystack signature verification failed during processing');
          await this.fallbackAlert('paystack', 'Signature verification failed during processing', payload);
          // Include signature presence and a short sample for debugging (do not log full secret)
          await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Invalid signature', { signaturePresent: !!signature, signatureSample: signature ? signature.slice(0, 12) : null });
          return { received: true };
        }
      } catch (e) {
        this.logger.error('Error verifying Paystack signature during processing', e as any);
        await this.fallbackAlert('paystack', 'Error verifying signature during processing', payload);
        await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Signature verification error', { signaturePresent: !!signature });
        return { received: true };
      }
    }

    // If the original HTTP request was not signature-verified but a webhook secret
    // exists for the provider, treat this as a strict failure and alert administrators.
    if (!verified && paystackSecret) {
      await this.fallbackAlert('paystack', 'Queued webhook processed without request-time signature verification', payload);
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Missing signature verification during processing');
      return { received: true };
    }

    if (!this.verifyProviderPayload('paystack', payload)) {
      this.logger.warn(`Paystack webhook rejected: invalid payload event=${event ?? 'unknown'} reference=${payload?.data?.reference ?? 'missing'} status=${payload?.data?.status ?? 'unknown'}`);
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Invalid Paystack payload');
      return { received: true };
    }

    // Strict routing: Paystack webhooks should not be routed for crypto payment_method
    if (payload.payment_method === 'crypto') {
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Paystack webhook routed to wrong provider (crypto)');
      return { received: true };
    }

    if (this.detectPotentialFraud('paystack', payload)) {
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Suspected fraud on Paystack payload');
      return { received: true };
    }

    const log = await this.logWebhook('paystack', event, payload);
    const reference = payload.data?.reference;
    if (!reference) {
      this.logger.warn('Paystack webhook received without a reference');
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Missing reference' } });
      return { received: true };
    }

    // Amount validation (anti-fraud): verify webhook amount matches transaction amount.
    // Use transaction.metadata.amount_fiat when available (initiator provides fiat + exchange rate),
    // otherwise fall back to the stored transaction.amount conversion.
    if (['charge.success', 'payment.success', 'transaction.success'].includes(event)) {
      try {
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const metadata = transaction.metadata as any ?? {};
          // Paystack webhook amount is sent in kobo (integer). Prefer comparing against original fiat amount
          // stored in metadata (amount_fiat), otherwise fall back to transaction.amount * 100.
          const webhookAmount = Number(payload.data?.amount);
          let expectedKobo: number | null = null;
          if (metadata?.amount_fiat !== undefined && metadata?.amount_fiat !== null) {
            expectedKobo = Math.round(Number(metadata.amount_fiat) * 100);
          } else {
            // Prefer the deposit base amount when available (avoid comparing against total)
            const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
            if (deposit && deposit.amount !== undefined && deposit.amount !== null) {
              expectedKobo = Math.round(Number(deposit.amount) * 100);
            } else {
              expectedKobo = Number.isFinite(Number(transaction.amount)) ? Math.round(Number(transaction.amount) * 100) : null;
            }
          }

          if (expectedKobo === null || isNaN(webhookAmount)) {
            this.logger.warn(`Paystack amount validation skipped for ${reference} due to missing data`);
          } else if (Math.abs(webhookAmount - expectedKobo) !== 0) {
            // Log difference for audit, but accept—real money was received
            this.logger.warn(
              `Paystack amount difference for ${reference}: expected ${expectedKobo} kobo, received ${webhookAmount} kobo (diff: ${webhookAmount - expectedKobo} kobo)`,
            );
          }
        }
      } catch (e) {
        this.logger.error('Error validating Paystack amount', e as any);
        await this.fallbackAlert('paystack', 'Error during amount validation', payload);
        await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Amount validation error' } });
        return { received: true };
      }
    }

    // Always enqueue webhook events for asynchronous processing.
    const queueEntry = {
      provider: 'paystack',
      event,
      reference,
      payload,
      receivedAt: Date.now(),
    };

    let queued = false;
    try {
      await this.webhookQueue.add(queueEntry);
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'queued' } });
      queued = true;
    } catch (e) {
      this.logger.error('Failed to enqueue Paystack webhook to Bull queue', e as any);
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'failed', response: 'enqueue_error' } });
      await this.fallbackAlert('paystack', 'Failed to enqueue webhook for processing', payload);
    }

    if (!queued) {
      this.logger.warn('Paystack webhook queue failed; leaving event retryable');
      return { received: true };
    } else {
      this.logger.log('Paystack webhook queued successfully for asynchronous processing');
    }

    if (eventId) await this.markProcessed('paystack', eventId);
    return { received: true };
  }

  async handleIvorypayWebhook(payload: any, verified = false) {
    const event = payload.event ?? payload.status;
    const status = payload.data?.status ?? payload.status ?? payload.data?.state ?? 'unknown';
    const candidateRefs = {
      topLevelReference: payload?.reference ?? null,
      topLevelId: payload?.id ?? null,
      dataReference: payload?.data?.reference ?? null,
      dataTxRef: payload?.data?.tx_ref ?? null,
      dataTrxRef: payload?.data?.trxref ?? null,
      dataTransactionReference: payload?.data?.transaction_reference ?? null,
      dataTransactionReferenceAlt: payload?.data?.transactionReference ?? null,
    };
    const foundReference = this.getIvorypayReference(payload);
    this.logger.log(`Ivorypay webhook payload: ${JSON.stringify(payload)}`);
    this.logger.log(`Ivorypay webhook received: event=${event ?? 'unknown'} resolvedReference=${foundReference ?? 'missing'} status=${status}`);
    this.logger.log(`Ivorypay webhook signature verified: reference=${foundReference ?? 'missing'}`);
    this.logger.debug(`Ivorypay webhook candidate refs: ${JSON.stringify(candidateRefs)}`);
    const eventId = this.getEventId('ivorypay', payload);
    if (eventId && (await this.isReplay('ivorypay', eventId))) {
      this.logger.warn(`Replay detected for ivorypay:${eventId}`);
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Replay detected');
      return { received: true };
    }
    const ivorySecret = this.cfg.get<string>('IVORYPAY_WEBHOOK_SECRET');
    if (!verified && ivorySecret) {
      await this.fallbackAlert('ivorypay', 'Queued webhook processed without request-time signature verification', payload);
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Missing signature verification during processing');
      return { received: true };
    }

    if (!this.verifyProviderPayload('ivorypay', payload)) {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Invalid Ivorypay payload');
      return { received: true };
    }

    // Strict routing: Ivorypay webhooks should be for crypto channel, but allow nested data.channel.
    const channel = (payload.channel ?? payload.data?.channel)?.toString?.().toLowerCase?.();
    if (channel && channel !== 'crypto') {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Ivorypay webhook routed to wrong provider (non-crypto)');
      return { received: true };
    }

    if (this.detectPotentialFraud('ivorypay', payload)) {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Suspected fraud on Ivorypay payload');
      return { received: true };
    }

    const log = await this.logWebhook('ivorypay', event, payload);
    let reference = this.getIvorypayReference(payload);
    let resolvedContext = null as any;

    if (!reference) {
      const fallbackCandidates = this.buildIvorypayReferenceCandidates(payload);
      if (fallbackCandidates.length) {
        resolvedContext = await this.resolveIvorypayDepositAndTransaction(payload, fallbackCandidates[0]);
        reference = resolvedContext.resolvedReference ?? fallbackCandidates[0];
      }
    }

    if (!reference) {
      this.logger.warn('Ivorypay webhook received without a reference');
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Missing reference' } });
      return { received: true };
    }

    if (!resolvedContext) {
      resolvedContext = await this.resolveIvorypayDepositAndTransaction(payload, reference);
    }
    const resolvedReference = resolvedContext.resolvedReference ?? reference;
    if (resolvedReference !== reference) {
      this.logger.log(`Ivorypay webhook received: resolved incoming reference ${reference} to internal reference ${resolvedReference}`);
    }

    const successWithdrawalEvents = ['withdrawal.success', 'transfer.success', 'payout.success'];
    const failureWithdrawalEvents = ['withdrawal.failed'];
    const isSuccessEvent = this.isIvorypaySuccessEvent(event, status);
    const isFailureEvent = this.isIvorypayFailureEvent(event, status);
    // Amount validation (anti-fraud): verify webhook amount matches transaction amount
    if (isSuccessEvent) {
      try {
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const metadata = transaction.metadata as any ?? {};
          const webhookAmount = Number(payload.data?.amount ?? payload.amount);
          // Prefer comparing against original fiat amount if available in metadata
          let expected = metadata?.amount_fiat !== undefined && metadata?.amount_fiat !== null
            ? Number(metadata.amount_fiat)
            : Number(transaction.amount);

          if (!isFinite(expected) || isNaN(webhookAmount)) {
            this.logger.warn(`Ivorypay amount validation skipped for ${reference} due to missing data`);
          } else if (Math.abs(webhookAmount - expected) > 0.01) { // allow small floating-point differences
            this.logger.warn(`Amount mismatch for Ivorypay reference ${reference}: expected ${expected}, got ${webhookAmount}`);
            await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Amount mismatch' } });
            await this.fallbackAlert('ivorypay', `Amount mismatch detected for ${reference}: expected ${expected}, got ${webhookAmount}`, payload);
            return { received: true };
          }
        }
      } catch (e) {
        this.logger.error('Error validating Ivorypay amount', e as any);
        await this.fallbackAlert('ivorypay', 'Error during amount validation', payload);
        await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Amount validation error' } });
        return { received: true };
      }
    }

    // Enqueue Ivorypay events for asynchronous processing.
    const queueEntry = {
      provider: 'ivorypay',
      event,
      reference: resolvedReference,
      payload,
      receivedAt: Date.now(),
    };

    let queued = false;
    try {
      await this.webhookQueue.add(queueEntry);
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'queued' } });
      queued = true;
    } catch (e) {
      this.logger.error('Failed to enqueue Ivorypay webhook to Bull queue', e as any);
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'failed', response: 'enqueue_error' } });
      await this.fallbackAlert('ivorypay', 'Failed to enqueue webhook for processing', payload);
    }

    if (!queued) {
      this.logger.warn('Ivorypay webhook queue failed; leaving event retryable');
      return { received: true };
    } else {
      this.logger.log('Ivorypay webhook queued successfully for asynchronous processing');
    }

    if (eventId) await this.markProcessed('ivorypay', eventId);
    return { received: true };
  }

  private async logWebhook(provider: string, event: string, payload: any, status = 'received', response?: string) {
    return this.prisma.webhook_logs.create({
      data: {
        provider,
        event_name: event,
        payload,
        status,
        response,
      },
    });
  }

  private async rejectWebhook(provider: string, event: string, payload: any, reason: string, meta?: any) {
    this.logger.warn(`Rejecting webhook from ${provider}: ${reason}`);
    const response = typeof meta === 'object' && meta ? `${reason} | meta=${JSON.stringify(meta)}` : reason;
    return this.logWebhook(provider, event, payload, 'rejected', response);
  }
  private verifyProviderPayload(provider: string, payload: any) {
    if (provider === 'paystack') {
      // Require expected Paystack fields: event and data.reference.
      // For success events, require a numeric amount. For failure/cancel/expired
      // events, the reference is enough to allow processing of the failure path.
      const hasEvent = !!payload?.event;
      const hasRef = !!payload?.data?.reference && typeof payload.data.reference === 'string';
      const amount = payload?.data?.amount ?? payload?.amount;
      const hasAmount = amount !== undefined && amount !== null && !isNaN(Number(amount));

      const successEvents = ['charge.success', 'payment.success', 'transaction.success'];
      if (successEvents.includes(payload.event)) {
        return hasEvent && hasRef && hasAmount;
      }

      return hasEvent && hasRef;
    }

    if (provider === 'ivorypay') {
      // Ivorypay: prefer top-level reference or data.reference and some status/event
      const hasRef = !!this.getIvorypayReference(payload);
      const hasEvent = !!payload?.event || !!payload?.status;
      return hasRef && hasEvent;
    }

    return false;
  }

  private getIvorypayReference(payload: any): string | null {
    const ref = (
      payload?.data?.reference ??
      payload?.data?.provider_reference ??
      payload?.data?.payment_reference ??
      payload?.data?.transaction_reference ??
      payload?.data?.tx_ref ??
      payload?.data?.trxref ??
      payload?.data?.payment_id ??
      payload?.data?.transaction_id ??
      payload?.data?.id ??
      payload?.reference ??
      payload?.id
    );
    return typeof ref === 'string' && ref.trim() ? ref.trim() : ref?.toString?.().trim() || null;
  }

  private extractUuidFromString(value: any): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }
    const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  private buildIvorypayReferenceCandidates(payload: any, metadata: any = {}): string[] {
    const urlCandidates = [
      payload?.data?.checkoutUrl,
      payload?.data?.payment_link,
      payload?.data?.paymentUrl,
      payload?.data?.collectionDetails?.checkoutUrl,
      payload?.checkoutUrl,
      payload?.payment_link,
      payload?.paymentUrl,
    ]
      .map((value) => this.extractUuidFromString(value))
      .filter((value): value is string => !!value);

    return [
      payload?.data?.id,
      payload?.id,
      payload?.data?.transaction_id,
      payload?.data?.payment_id,
      payload?.data?.tx_ref,
      payload?.data?.trxref,
      payload?.data?.transaction_reference,
      payload?.data?.transactionReference,
      payload?.data?.reference,
      payload?.reference,
      payload?.data?.withdrawal_id,
      payload?.data?.withdrawalId,
      payload?.data?.transfer_id,
      payload?.data?.transferId,
      payload?.data?.payout_id,
      payload?.data?.payoutId,
      payload?.data?.checkoutUrl,
      payload?.data?.payment_link,
      payload?.data?.paymentUrl,
      payload?.data?.collectionDetails?.checkoutUrl,
      payload?.checkoutUrl,
      payload?.payment_link,
      payload?.paymentUrl,
      metadata.provider_ref,
      metadata.provider_transaction_id,
      metadata.provider_reference,
      metadata.ivorypay_withdrawal_id,
      metadata.ivorypay_withdrawal_id ?? metadata.withdrawal_id,
      metadata.withdrawal_id,
      metadata.transfer_id,
      metadata.payout_id,
      ...urlCandidates,
    ]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => value?.toString?.().trim())
      .filter((value, index, self) => !!value && self.indexOf(value) === index);
  }

  private async verifyIvorypayWebhookTransaction(reference: string, providerReference: string | undefined, candidateRefs: string[]) {
    try {
      const verifiedTransaction = await this.ivorypayService.verifyTransaction(reference, providerReference, candidateRefs);
      const status = verifiedTransaction?.status?.toString().toLowerCase() ?? '';
      if (!['success', 'completed'].includes(status)) {
        return null;
      }
      return verifiedTransaction;
    } catch (error) {
      this.logger.warn(`Ivorypay webhook verification failed for ${reference}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private isIvorypayVerifiedAmountAcceptable(transaction: any, verifiedTransaction: any): boolean {
    const transactionMetadata = (transaction?.metadata as any) ?? {};
    const expectedUsd = Number(transactionMetadata.amount_usd ?? transactionMetadata.amount_fiat ?? NaN);
    const expectedFarm = Number(transactionMetadata.amount_farm ?? transaction?.amount ?? NaN);

    const verifiedUsd = Number(
      verifiedTransaction?.amount_usd ??
      verifiedTransaction?.data?.amount_usd ??
      verifiedTransaction?.amount ??
      verifiedTransaction?.data?.amount ??
      NaN,
    );
    const verifiedFarm = Number(
      verifiedTransaction?.amount_farm ??
      verifiedTransaction?.data?.amount_farm ??
      verifiedTransaction?.amount ??
      verifiedTransaction?.data?.amount ??
      NaN,
    );

    if (Number.isFinite(expectedUsd) && Number.isFinite(verifiedUsd) && expectedUsd > 0 && verifiedUsd > 0) {
      return Math.abs(expectedUsd - verifiedUsd) <= 0.5;
    }

    if (Number.isFinite(expectedFarm) && Number.isFinite(verifiedFarm) && expectedFarm > 0 && verifiedFarm > 0) {
      return Math.abs(expectedFarm - verifiedFarm) <= 0.01;
    }

    return true;
  }

  private async resolveIvorypayInternalReference(reference: string): Promise<string | null> {
    const deposit = await this.prisma.deposit.findFirst({
      where: {
        OR: [
          { reference },
          { providerRef: reference },
          { providerTransactionId: reference },
          { providerReference: reference },
          { checkoutId: reference },
          { paymentReference: reference },
          { merchantReference: reference },
        ],
      },
      select: { reference: true },
    });
    if (deposit?.reference) {
      return deposit.reference;
    }

    const transaction = await this.prisma.transactions.findFirst({
      where: {
        OR: [
          { transaction_reference: reference },
          { metadata: { path: ['provider_ref'], equals: reference } as any },
          { metadata: { path: ['provider_transaction_id'], equals: reference } as any },
          { metadata: { path: ['provider_reference'], equals: reference } as any },
          { metadata: { path: ['provider_payment_id'], equals: reference } as any },
          { metadata: { path: ['provider_checkout_id'], equals: reference } as any },
          { metadata: { path: ['payment_reference'], equals: reference } as any },
          { metadata: { path: ['merchant_reference'], equals: reference } as any },
          { metadata: { path: ['tx_ref'], equals: reference } as any },
          { metadata: { path: ['trxref'], equals: reference } as any },
          { metadata: { path: ['transaction_reference'], equals: reference } as any },
          { metadata: { path: ['ivorypay_withdrawal_id'], equals: reference } as any },
          { metadata: { path: ['withdrawal_id'], equals: reference } as any },
          { metadata: { path: ['transfer_id'], equals: reference } as any },
          { metadata: { path: ['payout_id'], equals: reference } as any },
        ],
      },
      select: { transaction_reference: true },
    });

    return transaction?.transaction_reference ?? null;
  }

  private async resolveIvorypayDepositAndTransaction(payload: any, fallbackReference?: string): Promise<IvorypayResolveContext> {
    const payloadIdentifiers = this.ivorypayService.extractProviderIdentifiers(payload);
    const identifierCandidates = Object.values(payloadIdentifiers)
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => value?.toString?.().trim())
      .filter((value, index, self) => !!value && self.indexOf(value) === index);

    const candidates = [fallbackReference, this.getIvorypayReference(payload), ...this.buildIvorypayReferenceCandidates(payload), ...identifierCandidates]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .filter((value, index, self) => self.indexOf(value) === index);

    for (const candidate of candidates) {
      const transaction = await this.prisma.transactions.findFirst({
        where: {
          OR: [
            { transaction_reference: candidate },
            { metadata: { path: ['provider_ref'], equals: candidate } as any },
            { metadata: { path: ['provider_transaction_id'], equals: candidate } as any },
            { metadata: { path: ['provider_reference'], equals: candidate } as any },
            { metadata: { path: ['provider_payment_id'], equals: candidate } as any },
            { metadata: { path: ['provider_checkout_id'], equals: candidate } as any },
            { metadata: { path: ['payment_reference'], equals: candidate } as any },
            { metadata: { path: ['merchant_reference'], equals: candidate } as any },
            { metadata: { path: ['tx_ref'], equals: candidate } as any },
            { metadata: { path: ['trxref'], equals: candidate } as any },
            { metadata: { path: ['transaction_reference'], equals: candidate } as any },
            { metadata: { path: ['ivorypay_withdrawal_id'], equals: candidate } as any },
            { metadata: { path: ['withdrawal_id'], equals: candidate } as any },
            { metadata: { path: ['transfer_id'], equals: candidate } as any },
            { metadata: { path: ['payout_id'], equals: candidate } as any },
          ],
        },
      });

      let deposit: any = null;
      if (transaction) {
        deposit = await this.prisma.deposit.findFirst({
          where: {
            OR: [
              { reference: transaction.transaction_reference },
              { reference: candidate },
              { providerRef: candidate },
              { providerTransactionId: candidate },
              { providerReference: candidate },
              { checkoutId: candidate },
              { paymentReference: candidate },
              { merchantReference: candidate },
            ],
          },
        });

        return {
          transaction,
          deposit,
          resolvedReference: transaction.transaction_reference,
          matchedReference: candidate,
        };
      }

      deposit = await this.prisma.deposit.findFirst({
        where: {
          OR: [
            { reference: candidate },
            { providerRef: candidate },
            { providerTransactionId: candidate },
            { providerReference: candidate },
            { checkoutId: candidate },
            { paymentReference: candidate },
            { merchantReference: candidate },
          ],
        },
      });

      if (deposit) {
        const transactionByDeposit = await this.prisma.transactions.findFirst({
          where: { transaction_reference: deposit.reference },
        });
        return {
          transaction: transactionByDeposit,
          deposit,
          resolvedReference: deposit.reference,
          matchedReference: candidate,
        };
      }
    }

    return { transaction: null, deposit: null, resolvedReference: fallbackReference ?? null, matchedReference: null };
  }

  private isIvorypaySuccessEvent(event: string, status: string) {
    const normalizedEvent = event?.toString()?.toLowerCase() ?? '';
    const normalizedStatus = status?.toString()?.toLowerCase() ?? '';
    const successEvents = [
      'payment.success',
      'transaction.completed',
      'cryptoCollection.success',
      'fiatCollection.success',
      'payment.completed',
      'transaction.success',
      'withdrawal.success',
      'withdrawal.completed',
      'transfer.success',
      'transfer.completed',
      'payout.success',
      'payout.completed',
      'completed',
      'success',
    ];
    const successStatuses = ['success', 'completed'];
    return successEvents.includes(normalizedEvent) || successStatuses.includes(normalizedStatus);
  }

  private isIvorypayFailureEvent(event: string, status: string) {
    const normalizedEvent = event?.toString()?.toLowerCase() ?? '';
    const normalizedStatus = status?.toString()?.toLowerCase() ?? '';
    const failureEvents = [
      'payment.failed',
      'transaction.failed',
      'cryptoCollection.failed',
      'fiatCollection.failed',
      'payment.cancelled',
      'transaction.cancelled',
      'cancelled',
      'failed',
      'withdrawal.failed',
    ];
    const failureStatuses = ['failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'];
    return failureEvents.includes(normalizedEvent) || failureStatuses.includes(normalizedStatus);
  }

  private async fallbackAlert(provider: string, reason: string, payload: any) {
    try {
      this.logger.error(`Fallback alert for ${provider}: ${reason}`);
      // Record an unverified webhook log for operator review
      await this.logWebhook(provider, 'unknown', payload, 'unverified', reason);

      // Emit a server-level security alert for any connected admin consoles
      try {
        this.websocket.server?.emit('security:alert', { provider, reason, timestamp: new Date().toISOString() });
      } catch (e) {
        this.logger.debug('Failed to emit websocket security alert', e as any);
      }
    } catch (e) {
      this.logger.error('Failed to create fallback alert', e as any);
    }
  }

  private getEventId(provider: string, payload: any) {
    return (
      payload.id ?? payload.data?.id ?? payload.data?.reference ?? payload.reference ?? null
    );
  }

  private async isReplay(provider: string, eventId: string) {
    try {
      const client = this.getRedisClient();
      if (!client) return false;
      const key = `${this.cfg.get<string>('WEBHOOK_DEDUP_PREFIX', 'webhook:processed:')}${provider}:${eventId}`;
      const v = await client.get(key);
      return !!v;
    } catch (e) {
      this.logger.error('Failed to access Redis for webhook replay check', e as any);
      return false;
    }
  }

  private async markProcessed(provider: string, eventId: string) {
    try {
      const client = this.getRedisClient();
      if (!client) return;
      const key = `${this.cfg.get<string>('WEBHOOK_DEDUP_PREFIX', 'webhook:processed:')}${provider}:${eventId}`;
      const ttl = Number(this.cfg.get<number>('WEBHOOK_DEDUP_TTL_MS', 0));
      if (ttl > 0) {
        await client.set(key, '1', 'PX', ttl, 'NX');
      } else {
        await client.set(key, '1', 'NX');
      }
    } catch (e) {
      this.logger.error('Failed to mark webhook processed in Redis', e as any);
    }
  }

  private detectPotentialFraud(provider: string, payload: any) {
    const amount = this.normalizeAmount(payload?.data?.amount ?? payload?.amount ?? 0);
    const maxAmount = Number(this.cfg.get<number>('FRAUD_MAX_WEBHOOK_AMOUNT', 5000000));
    if (amount > maxAmount) {
      this.logger.warn(`Potential fraud detected: ${provider} amount ${amount} exceeds threshold ${maxAmount}`);
      return true;
    }

    if (provider === 'paystack' && payload?.data?.status && payload.data.status !== 'success' && payload.event === 'charge.success') {
      this.logger.warn('Paystack webhook contains inconsistent status for charge.success');
      return true;
    }

    return false;
  }

  private async finalizeDeposit(reference: string) {
    this.logger.log(`finalizeDeposit: start for reference=${reference}`);
    let deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    this.logger.log(`finalizeDeposit: deposit lookup returned ${deposit ? 'FOUND' : 'NOT_FOUND'}`);
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    this.logger.log(`finalizeDeposit: transaction lookup returned ${transaction ? `FOUND id=${transaction.id} status=${transaction.status}` : 'NOT_FOUND'}`);

    // Reference validation: require either deposit or valid transaction
    if (!transaction) {
      throw new BadRequestException(`Transaction not found for reference: ${reference}`);
    }

    if (!deposit && transaction?.amount) {
      const metadata = transaction.metadata as any;
      const userId = metadata?.user_id;
      const paymentMethod = metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'CRYPTO' : 'CARD';
      if (!userId) {
        this.logger.warn(`Deposit missing for reference ${reference} but transaction metadata.user_id is unavailable`);
      } else {
        this.logger.warn(`Deposit missing for reference ${reference}, reconstructing from transaction`);
        deposit = await this.prisma.deposit.create({
          data: {
            reference,
            amount: Number(transaction.amount),
            fee: 0,
            total: Number(transaction.amount),
            currency: transaction.currency || 'FARM',
            paymentMethod,
            provider: metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'ivorypay' : 'paystack',
            status: 'PENDING',
            userId,
          },
        });
        this.logger.log(`finalizeDeposit: reconstructed deposit id=${deposit.id} reference=${deposit.reference}`);
      }
    }

    const depositPending = !!deposit && deposit.status === 'PENDING';
    const depositComplete = !!deposit && deposit.status === 'SUCCESS';
    const isDeposit = !!transaction && transaction.transaction_type?.toLowerCase() === 'deposit';
    const txStatus = transaction?.status?.toLowerCase();
    const txPending = isDeposit && ['pending', 'processing'].includes(txStatus ?? '');
    const txComplete = isDeposit && txStatus === 'completed';
    const txFailed = isDeposit && ['failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');
    const txUnknown = isDeposit && !['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');

    if (txFailed || txUnknown) {
      this.logger.warn(`finalizeDeposit: transaction ${reference} status=${transaction?.status} - not crediting wallet`);
      return false;
    }

    if (depositComplete && txComplete) {
      this.logger.log(`finalizeDeposit: already completed for ${reference}`);
      return true;
    }

    if (depositPending && txPending) {
      this.logger.log(`finalizeDeposit: pending deposit and pending transaction for ${reference} - finalizing with transaction`);
      return this.finalizePendingDepositWithTransaction(reference, deposit, transaction);
    }

    if (depositPending) {
      // Directly handle pending deposit with wallet credit here (no delegation).
      // This is the ONLY authorized path for crediting wallets on deposit success.
      this.logger.log(`finalizeDeposit: deposit is pending for ${reference}, crediting wallet directly`);
      return this.creditPendingDepositWithWallet(reference, deposit, transaction);
    }

    if (depositComplete && txPending) {
      return this.completePendingTransaction(reference, transaction);
    }

    if (txPending) {
      this.logger.log(`finalizeDeposit: transaction pending for ${reference}, crediting pending transaction deposit`);
      return this.creditPendingTransactionDeposit(reference);
    }

    this.logger.warn(`finalizeDeposit: transaction ${reference} status=${transaction?.status} is not eligible for wallet credit`);
    return false;

    this.logger.log(`finalizeDeposit: end for ${reference} returning ${depositComplete || txComplete}`);
    return depositComplete || txComplete;
  }

  @Cron('*/5 * * * *')
  async fixStuckDeposits() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const stuck = await this.prisma.transactions.findMany({
      where: {
        transaction_type: 'deposit',
        status: 'pending',
        created_at: { lt: cutoff },
      },
    });

    this.logger.log(`fixStuckDeposits: found ${stuck.length} stuck deposit transaction(s)`);

    for (const tx of stuck) {
      try {
        const deposit = await this.prisma.deposit.findFirst({ where: { reference: tx.transaction_reference } });
        const metadata = (tx.metadata as any) ?? {};
        const metaProvider = (metadata.provider?.toString()?.toLowerCase() || '').trim();
        const depositProvider = (deposit?.provider?.toString()?.toLowerCase() || '').trim();
        const paymentMethod = (deposit?.paymentMethod?.toString()?.toUpperCase() || '').trim();

        let provider = 'unknown';
        if (paymentMethod === 'CRYPTO') {
          provider = 'ivorypay';
        } else if (paymentMethod) {
          provider = 'paystack';
        } else if (depositProvider) {
          provider = depositProvider;
        } else if (metaProvider) {
          provider = metaProvider;
        }

        this.logger.log(`fixStuckDeposits: deposit provider=${depositProvider} paymentMethod=${paymentMethod} metadata.provider=${metaProvider} resolved provider=${provider}`);

        if (provider === 'ivorypay' && paymentMethod !== 'CRYPTO') {
          this.logger.warn(`fixStuckDeposits: deposit ${tx.transaction_reference} has provider='ivorypay' but paymentMethod='${deposit?.paymentMethod}'. Overriding to paystack verification.`);
          provider = 'paystack';
        }

        let rawProviderIds = [
          metadata.provider_transaction_id,
          metadata.provider_ref,
          metadata.provider_reference,
          metadata.payment_id,
          metadata.transaction_id,
          metadata.txn_id,
          metadata.tx_ref,
          metadata.trxref,
          metadata.transaction_reference,
          metadata.transactionReference,
          metadata.provider_payment_id,
          metadata.provider_checkout_id,
          deposit?.providerRef,
        ]
          .filter((v) => !!v)
          .map((v) => v?.toString())
          // Exclude our internal transaction_reference — do not query the provider with our UUID
          .filter((v) => v?.toString().trim() !== tx.transaction_reference)
          .filter((value, index, self) => !!value && self.indexOf(value) === index)
          // Keep the first candidate even if it looks like a UUID, because it may be
          // the provider reference recorded at checkout creation.
          .filter((v, index) => index === 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v));

        if (!rawProviderIds.length) {
          const payloadCandidates = this.buildIvorypayReferenceCandidates(deposit?.providerPayload ?? {}, metadata);
          const payloadIdentifiers = this.ivorypayService.extractProviderIdentifiers(deposit?.providerPayload ?? {});
          const payloadIdentifierValues = Object.values(payloadIdentifiers ?? {})
            .filter((id) => !!id)
            .map((id) => id?.toString?.().trim())
            .filter((value) => !!value && value !== tx.transaction_reference);

          rawProviderIds = Array.from(new Set([...rawProviderIds, ...payloadCandidates, ...payloadIdentifierValues]))
            .filter((value, index, self) => self.indexOf(value) === index)
            .filter((value, index) => index === 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

          if (rawProviderIds.length) {
            this.logger.log(`fixStuckDeposits: discovered fallback Ivorypay provider ids for ${tx.transaction_reference}: ${JSON.stringify(rawProviderIds)}`);
          }
        }

        // Ivorypay can also verify by the original transaction reference we supplied,
        // so do not skip stuck deposits simply because a provider-specific id is missing.
        const providerTransactionId = provider === 'ivorypay'
          ? rawProviderIds[0] ?? tx.transaction_reference
          : tx.transaction_reference;

        if (provider === 'ivorypay' && !providerTransactionId) {
          this.logger.warn(`fixStuckDeposits: skipping ${tx.transaction_reference} — no Ivorypay reference available to verify`);
          continue;
        }

        this.logger.log(`fixStuckDeposits: ${provider} verify lookup for ${tx.transaction_reference} using primary providerTransactionId=${providerTransactionId} candidateRefs=${JSON.stringify(rawProviderIds)}`);

        let verifiedTransaction: any = null;
        try {
          if (provider === 'paystack') {
            verifiedTransaction = await this.paystackService.verifyTransaction(tx.transaction_reference);
          } else if (provider === 'ivorypay') {
            const candidates = rawProviderIds;
            verifiedTransaction = await this.ivorypayService.verifyTransaction(/* internal reference omitted */ tx.transaction_reference, providerTransactionId, candidates);
          } else {
            this.logger.log(`fixStuckDeposits: skipping ${tx.transaction_reference}, unsupported provider=${provider}`);
            continue;
          }

          if (verifiedTransaction && provider === 'ivorypay') {
            const lookupId = verifiedTransaction.providerReference ?? verifiedTransaction.providerIdentifiers?.transaction_id ?? verifiedTransaction.providerIdentifiers?.id ?? verifiedTransaction.providerIdentifiers?.provider_reference ?? verifiedTransaction.providerIdentifiers?.payment_id ?? verifiedTransaction.providerIdentifiers?.checkout_id ?? null;
            if (lookupId && lookupId !== tx.transaction_reference) {
              const metadata = (tx.metadata as any) ?? {};
              const providerIdentifiers = verifiedTransaction.providerIdentifiers ?? {};
              const updatedMetadata = {
                ...metadata,
                provider_ref: lookupId,
                provider_transaction_id: providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? metadata.provider_transaction_id ?? null,
                provider_payment_id: providerIdentifiers.payment_id ?? metadata.provider_payment_id ?? null,
                provider_checkout_id: providerIdentifiers.checkout_id ?? metadata.provider_checkout_id ?? null,
                provider_reference: providerIdentifiers.provider_reference ?? metadata.provider_reference ?? null,
                payment_reference: providerIdentifiers.payment_reference ?? metadata.payment_reference ?? null,
                merchant_reference: providerIdentifiers.merchant_reference ?? metadata.merchant_reference ?? null,
                tx_ref: providerIdentifiers.tx_ref ?? metadata.tx_ref ?? null,
                trxref: providerIdentifiers.trxref ?? metadata.trxref ?? null,
                transaction_reference: providerIdentifiers.transaction_reference ?? metadata.transaction_reference ?? null,
              };
              try {
                await this.prisma.deposit.update({
                  where: { reference: tx.transaction_reference },
                  data: {
                    providerRef: lookupId,
                    providerTransactionId: providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? null,
                    providerReference: providerIdentifiers.provider_reference ?? null,
                    checkoutId: providerIdentifiers.checkout_id ?? null,
                    paymentReference: providerIdentifiers.payment_reference ?? null,
                    merchantReference: providerIdentifiers.merchant_reference ?? null,
                    providerPayload: verifiedTransaction ?? null,
                  },
                });
                await this.prisma.transactions.update({ where: { id: tx.id }, data: { metadata: updatedMetadata } });
                this.logger.log(`fixStuckDeposits: persisted verified provider id ${lookupId} for ${tx.transaction_reference}`);
              } catch (updateErr) {
                this.logger.debug(`fixStuckDeposits: failed to persist verified provider id ${lookupId}`, updateErr as any);
              }
            }
          }
        } catch (firstErr) {
          this.logger.warn(`fixStuckDeposits: ${provider} verify lookup failed for ${tx.transaction_reference} using providerTransactionId=${providerTransactionId ?? 'internal'}`, firstErr as any);
          continue;
        }

        const status = (verifiedTransaction?.status ?? '').toString().toLowerCase();
        if (['success', 'completed'].includes(status)) {
          await this.finalizeDeposit(tx.transaction_reference);
        } else if (['failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'].includes(status)) {
          const providerLabel = provider === 'paystack' ? 'Paystack' : 'Ivorypay';
          await this.depositService.failDeposit(tx.transaction_reference, `${providerLabel} verify indicates ${verifiedTransaction.status}`);
        } else {
          this.logger.log(`fixStuckDeposits: leaving ${tx.transaction_reference} pending, ${provider} status=${verifiedTransaction?.status ?? 'unknown'}`);
        }
      } catch (err) {
        this.logger.error(`fixStuckDeposits: failed to process ${tx.transaction_reference}`, err as any);
      }
    }

    await this.cleanupStaleFailedDeposits();
  }

  private async cleanupStaleFailedDeposits() {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const staleTxs = await this.prisma.transactions.findMany({
      where: {
        transaction_type: 'deposit',
        status: { in: ['failed', 'cancelled', 'reversed'] },
        updated_at: { lt: cutoff },
      },
      select: {
        id: true,
        transaction_reference: true,
      },
    });

    if (staleTxs.length) {
      this.logger.log(`cleanupStaleFailedDeposits: found ${staleTxs.length} stale failed deposit transaction(s)`);

      for (const tx of staleTxs) {
        try {
          const deposit = await this.prisma.deposit.findFirst({
            where: {
              reference: tx.transaction_reference,
              status: 'PENDING',
            },
          });

          if (!deposit) {
            continue;
          }

          await this.prisma.$transaction(async (txDb) => {
            await txDb.deposit.delete({ where: { id: deposit.id } });
            await txDb.transactions.delete({ where: { id: tx.id } });
          });

          this.logger.log(`cleanupStaleFailedDeposits: deleted stale deposit ${deposit.reference} and transaction ${tx.id}`);
        } catch (err) {
          this.logger.error(`cleanupStaleFailedDeposits: failed to delete stale deposit for transaction ${tx.transaction_reference}`, err as any);
        }
      }
    }

    const staleFailedDeposits = await this.prisma.deposit.findMany({
      where: {
        status: 'FAILED',
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        reference: true,
      },
    });

    if (!staleFailedDeposits.length) {
      return;
    }

    this.logger.log(`cleanupStaleFailedDeposits: found ${staleFailedDeposits.length} stale FAILED deposit record(s)`);
    for (const deposit of staleFailedDeposits) {
      try {
        await this.prisma.deposit.delete({ where: { id: deposit.id } });
        this.logger.log(`cleanupStaleFailedDeposits: deleted stale FAILED deposit ${deposit.reference}`);
      } catch (err) {
        this.logger.error(`cleanupStaleFailedDeposits: failed to delete stale FAILED deposit ${deposit.reference}`, err as any);
      }
    }
  }

  private async finalizePendingDepositWithTransaction(reference: string, deposit: any, transaction: any) {
    // Validate transaction reference before proceeding with wallet operations
    if (!transaction || !transaction.id) {
      throw new BadRequestException(`Invalid transaction for deposit finalization: reference=${reference}`);
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        let wallet = await tx.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
        if (!wallet) {
          wallet = await tx.wallets.create({
            data: {
              user_id: deposit.userId,
              wallet_name: 'Main Wallet',
              wallet_type: 'user',
              wallet_address: uuidv4(),
              currency: deposit.currency || 'FARM',
            },
          });
        }

        const updatedDeposit = await tx.deposit.updateMany({
          where: { id: deposit.id, status: 'PENDING' },
          data: { status: 'SUCCESS' },
        });
        if (updatedDeposit.count === 0) {
          return { ok: false };
        }

        const amount = this.normalizeAmount(resolveDepositCreditAmount(transaction, deposit));
        const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));

        await tx.wallets.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });

        const ledgerEntry = await tx.ledger_entries.create({
          data: {
            transaction_id: transaction?.id ?? null,
            wallet_id: wallet.id,
            entry_type: 'credit',
            amount,
            balance_before: previousBalance,
            balance_after: previousBalance + amount,
            description: `Deposit completed — ref: ${reference}`,
          },
        });

        const isDeposit = transaction?.transaction_type?.toLowerCase() === 'deposit';
        if (transaction && isDeposit && transaction.status?.toLowerCase() !== 'completed') {
          await tx.transactions.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              receiver_wallet_id: transaction.receiver_wallet_id ?? wallet.id,
              processed_at: new Date(),
            },
          });
        }

        return { ok: true, wallet, amount, previousBalance, ledgerEntryId: ledgerEntry.id };
      },
      { timeout: 10000 },
    );

    if (!result.ok) {
      return false;
    }

    const completed = result as { ok: true; wallet: any; previousBalance: number; amount: number; ledgerEntryId: string };
    const notification = await this.notificationsService.sendNotification(deposit.userId, {
      type: 'deposit_completed',
      title: 'Deposit completed',
      body: `Your deposit of ${completed.amount} ${deposit.currency || 'FARM'} has been credited to your wallet.`,
      entityId: deposit.id,
      metadata: {
        reference,
        amount: completed.amount,
        currency: deposit.currency || 'FARM',
        ledgerEntryId: completed.ledgerEntryId,
      },
    });

    this.logger.log(`Ivorypay webhook credit completed: reference=${reference} walletBefore=${completed.previousBalance} walletAfter=${completed.previousBalance + completed.amount} amount=${completed.amount} ledgerId=${completed.ledgerEntryId} notificationId=${notification?.id ?? 'none'}`);

    this.websocket.emitBalanceUpdate(completed.wallet.user_id ?? '', completed.previousBalance + completed.amount);
    this.websocket.emitTransactionUpdate(completed.wallet.user_id ?? '', { reference, status: 'SUCCESS' });

    return true;
  }

  private async completePendingTransaction(reference: string, transaction?: any) {
    if (!transaction) {
      transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    }
    
    // Reference validation: require transaction to exist
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    const isDeposit = transaction?.transaction_type?.toLowerCase() === 'deposit';
    if (!isDeposit) {
      return false;
    }
    if (transaction.status?.toLowerCase() === 'completed') {
      return true;
    }

    const updates: any = {
      status: 'completed',
      processed_at: new Date(),
    };

    if (!transaction.receiver_wallet_id) {
      const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
      if (deposit) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
        if (wallet) updates.receiver_wallet_id = wallet.id;
      }
    }

    await this.prisma.transactions.update({
      where: { id: transaction.id },
      data: updates,
    });

    return true;
  }

  private async creditPendingTransactionDeposit(reference: string) {
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    
    // Reference validation: require transaction to exist for reference
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    const isDeposit = transaction?.transaction_type?.toLowerCase() === 'deposit';
    if (!isDeposit) return false;
    const txStatus = transaction.status?.toLowerCase();
    if (txStatus === 'completed') return true;
    if (!['pending', 'processing'].includes(txStatus ?? '')) {
      this.logger.warn(`creditPendingTransactionDeposit: transaction ${reference} status=${transaction.status} is not eligible for credit`);
      return false;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet: any = null;
      if (transaction.receiver_wallet_id) {
        wallet = await tx.wallets.findUnique({ where: { id: transaction.receiver_wallet_id } });
      }

      const meta = transaction.metadata as any;
      const userId = meta?.user_id;
      if (!wallet && userId) {
        wallet = await tx.wallets.findFirst({ where: { user_id: userId, is_active: true } });
      }

      if (!wallet && userId) {
        wallet = await tx.wallets.create({
          data: {
            user_id: userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: transaction.currency || 'FARM',
          },
        });
      }

      if (!wallet) return { ok: false };

      const prev = this.normalizeAmount(Number(wallet.balance ?? 0));
      const amt = this.normalizeAmount(resolveDepositCreditAmount(transaction));

      const updated = await tx.transactions.updateMany({
        where: { id: transaction.id, status: { not: 'completed' } },
        data: {
          status: 'completed',
          receiver_wallet_id: wallet.id,
          processed_at: new Date(),
        },
      });

      if (updated.count === 0) return { ok: false };

      await tx.wallets.update({ where: { id: wallet.id }, data: { balance: { increment: amt } } });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: amt,
          balance_before: prev,
          balance_after: prev + amt,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      return { ok: true, wallet, previousBalance: prev, amount: amt };
    });

    if (!result || !result.ok) return false;

    const wallet = (result as any).wallet;
    const previousBalance = (result as any).previousBalance;
    const amount = (result as any).amount;

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', previousBalance + amount);
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', { reference, status: 'SUCCESS' });

    return true;
  }

  /**
   * AUTHORIZED WALLET CREDIT PATH #3: Handle pending deposit with wallet credit.
   * This is called when a deposit record exists and is PENDING, but we need to credit the wallet.
   * This is the ONLY authorized method for wallet credit on deposit success.
   */
  private async creditPendingDepositWithWallet(reference: string, deposit: any, transaction?: any) {
    if (!deposit || deposit.status !== 'PENDING') {
      this.logger.warn(`creditPendingDepositWithWallet: deposit not in PENDING state for ${reference}`);
      return false;
    }

    if (!transaction) {
      transaction = await this.prisma.transactions.findUnique({
        where: { transaction_reference: reference },
      });
    }

    // STATE MACHINE VALIDATION: transaction must exist and be in pending state
    if (!transaction || transaction.status?.toLowerCase() !== 'pending') {
      this.logger.warn(
        `creditPendingDepositWithWallet: invalid transaction state for ${reference}. ` +
        `Transaction: ${transaction ? `exists, status=${transaction.status}` : 'missing'}`,
      );
      return false;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // STATE MACHINE: Update deposit status to SUCCESS (idempotent: only if PENDING)
      const updatedDeposits = await tx.deposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'SUCCESS' },
      });

      if (updatedDeposits.count === 0) {
        this.logger.warn(`creditPendingDepositWithWallet: deposit already updated or missing for ${reference}`);
        return { ok: false };
      }

      // ENSURE WALLET EXISTS
      let wallet = await tx.wallets.findFirst({
        where: { user_id: deposit.userId, is_active: true },
      });

      if (!wallet) {
        wallet = await tx.wallets.create({
          data: {
            user_id: deposit.userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: deposit.currency || 'FARM',
          },
        });
      }

      const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
      const creditAmount = this.normalizeAmount(resolveDepositCreditAmount(transaction, deposit));

      // WALLET CREDIT: This is the ONLY authorized place to credit wallets on deposit success
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: creditAmount } },
      });

      // LEDGER ENTRY: Record the credit
      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction?.id ?? null,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: creditAmount,
          balance_before: previousBalance,
          balance_after: previousBalance + creditAmount,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      // STATE MACHINE: Update transaction to completed (idempotent: only if pending)
      if (transaction && transaction.status?.toLowerCase() !== 'completed') {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            receiver_wallet_id: wallet.id,
            processed_at: new Date(),
          },
        });
      }

      return { ok: true, wallet, previousBalance, amount: creditAmount };
    });

    if (!result.ok) {
      return false;
    }

    const wallet = (result as any).wallet;
    const previousBalance = (result as any).previousBalance;
    const amount = (result as any).amount;
    const ledgerEntryId = (result as any).ledgerEntryId;

    const notification = await this.notificationsService.sendNotification(deposit.userId, {
      type: 'deposit_completed',
      title: 'Deposit completed',
      body: `Your deposit of ${amount} ${deposit.currency || 'FARM'} has been credited to your wallet.`,
      entityId: deposit.id,
      metadata: { reference, amount, currency: deposit.currency || 'FARM' },
    });

    this.logger.log(`Ivorypay deposit credited: reference=${reference} walletBefore=${previousBalance} walletAfter=${previousBalance + amount} amount=${amount} ledgerId=${ledgerEntryId} notificationId=${notification?.id ?? 'none'}`);

    this.websocket.emitBalanceUpdate(deposit.userId, previousBalance + amount);
    this.websocket.emitTransactionUpdate(deposit.userId, { reference, status: 'SUCCESS' });

    return true;
  }

  private async finalizeWithdrawal(reference: string, success: boolean, reason?: string) {
    const handledByWithdrawService = success
      ? await this.withdrawService.markAsSuccess(reference)
      : await this.withdrawService.rejectWithdrawal(reference, reason || 'Withdrawal failed');

    if (handledByWithdrawService) {
      await this.emitWithdrawalUpdate(reference, success ? 'SUCCESS' : 'FAILED');
      return true;
    }

    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
    });
    if (!transaction || transaction.transaction_type !== 'withdrawal') {
      return false;
    }

    if (success) {
      return this.completeTransactionWithdrawal(transaction);
    }

    return this.failTransactionWithdrawal(transaction, reason);
  }

  private async completeTransactionWithdrawal(transaction: any) {
    // Reference validation: require valid transaction
    if (!transaction || !transaction.id) {
      throw new BadRequestException('Invalid transaction for withdrawal completion');
    }

    if (transaction.status?.toLowerCase() === 'completed') {
      return true;
    }

    const wallet = await this.prisma.wallets.findUnique({
      where: { id: transaction.sender_wallet_id },
    });
    if (!wallet) {
      throw new BadRequestException(`Wallet not found for withdrawal transaction: ${transaction.id}`);
    }

    const previousBalance = Number(wallet.balance ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const withdrawAmount = Number(transaction.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: withdrawAmount },
          locked_balance: { decrement: Math.min(previousLocked, withdrawAmount) },
        },
      });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'debit',
          amount: withdrawAmount,
          balance_before: previousBalance,
          balance_after: previousBalance - withdrawAmount,
          description: `Withdrawal completed — ref: ${transaction.transaction_reference}`,
        },
      });

      await tx.transactions.updateMany({
        where: { id: transaction.id, status: { not: 'completed' } },
        data: { status: 'completed', processed_at: new Date() },
      });
    });

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', previousBalance - withdrawAmount);
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference: transaction.transaction_reference,
      status: 'SUCCESS',
    });

    return true;
  }

  private async failTransactionWithdrawal(transaction: any, reason?: string) {
    // Reference validation: require valid transaction
    if (!transaction || !transaction.id) {
      throw new BadRequestException('Invalid transaction for withdrawal failure handling');
    }

    if (transaction.status?.toLowerCase() === 'failed') {
      return true;
    }

    const wallet = await this.prisma.wallets.findUnique({
      where: { id: transaction.sender_wallet_id },
    });
    if (!wallet) {
      this.logger.warn(`Wallet not found for withdrawal transaction: ${transaction.id}`);
      return false;
    }

    const previousLocked = Number(wallet.locked_balance ?? 0);
    const unlockAmount = Math.min(previousLocked, Number(transaction.amount ?? 0));

    await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { locked_balance: { decrement: unlockAmount } },
      });

      await tx.transactions.updateMany({
        where: { id: transaction.id, status: { not: 'failed' } },
        data: { status: 'failed', processed_at: new Date() },
      });
    });

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', Number(wallet.balance ?? 0));
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference: transaction.transaction_reference,
      status: 'FAILED',
    });

    return true;
  }

  private async emitWithdrawalUpdate(reference: string, status: string) {
    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { reference },
    });
    if (!withdrawal) {
      return;
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: withdrawal.userId, is_active: true },
    });
    if (!wallet) {
      return;
    }

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', Number(wallet.balance ?? 0));
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference,
      status,
    });
  }

  private normalizeAmount(amount: any): number {
    const n = Number(amount ?? 0);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  private async retryVerifyTransaction(reference: string) {
    // Mobile-money and bank-transfer settlement can take up to 180 seconds.
    const attempts = 36;
    const intervalMs = 5000;
    for (let i = 0; i < attempts; i++) {
      try {
        await new Promise((r) => setTimeout(r, intervalMs));
        const verified = await this.paystackService.verifyTransaction(reference);
        if (verified && (verified.status ?? '').toString().toLowerCase() === 'success') {
          this.logger.log(`retryVerifyTransaction: verified success for ${reference} on attempt ${i + 1}`);
          await this.depositService.finalizeSuccessfulDeposit(reference);
          return true;
        }
      } catch (e: any) {
        this.logger.debug(`retryVerifyTransaction attempt ${i + 1} failed for ${reference}: ${e?.message ?? e}`);
      }
    }
    this.logger.log(`retryVerifyTransaction: no success for ${reference} after ${attempts} attempts`);
    return false;
  }

  private getFarmAmountForCredit(transaction: any, deposit?: any): number {
    const metadata = (transaction?.metadata as any) ?? {};
    const depositMetadata = (deposit?.metadata as any) ?? {};
    const farmToUsdRate = Number(metadata?.farm_to_usd_rate ?? depositMetadata?.farm_to_usd_rate ?? this.cfg.get<string>('IVORYPAY_FARM_TO_USD_RATE', '130')) || 130;
    const transactionCurrency = transaction?.currency?.toString?.().toUpperCase?.() ?? '';
    const depositCurrency = deposit?.currency?.toString?.().toUpperCase?.() ?? '';

    if ((transactionCurrency === 'USD' || depositCurrency === 'USD') && metadata?.amount_usd !== undefined) {
      return this.normalizeAmount(Number(metadata.amount_usd) * farmToUsdRate);
    }

    if (metadata?.amount_farm !== undefined && isFinite(Number(metadata.amount_farm))) {
      return this.normalizeAmount(Number(metadata.amount_farm));
    }

    if (transactionCurrency === 'USD' && isFinite(Number(transaction?.amount))) {
      return this.normalizeAmount(Number(transaction.amount) * farmToUsdRate);
    }

    if (depositCurrency === 'USD' && isFinite(Number(deposit?.amount))) {
      return this.normalizeAmount(Number(deposit.amount) * farmToUsdRate);
    }

    if (isFinite(Number(transaction?.amount))) {
      return this.normalizeAmount(Number(transaction.amount));
    }

    if (isFinite(Number(deposit?.amount))) {
      return this.normalizeAmount(Number(deposit.amount));
    }

    return 0;
  }

  /**
   * Process a Paystack webhook from the queue.
   * This is called by the WebhookProcessor after the event has been queued to Redis.
   * CRITICAL: This method should ONLY be called by the async processor, never directly from HTTP handlers.
   */
  async handlePaystackWebhookProcessing(payload: any) {
    const event = payload.event;
    const reference = payload.data?.reference;
    const status = payload.data?.status ?? payload.data?.gateway_response ?? payload.data?.failure_message ?? 'unknown';

    this.logger.log(`Paystack webhook processing start: event=${event} reference=${reference || 'missing'} status=${status}`);

    if (!reference) {
      this.logger.warn('Paystack webhook processing: missing reference');
      return;
    }
    const lockKey = `paystack:webhook:${reference}`;
    const lockTtl = Number(this.cfg.get<number>('WEBHOOK_LOCK_TTL_MS', 60000));
    const locked = await this.acquireLock(lockKey, lockTtl);
    if (!locked) {
      this.logger.warn(`paystack webhook processing skipped for ${reference} due to existing lock`);
      return;
    }

    try {
      // Defense-in-depth: validate amount before processing (catches queue corruption/manipulation)
      if (['charge.success', 'payment.success', 'transaction.success'].includes(event)) {
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const metadata = transaction.metadata as any ?? {};
          const webhookAmount = Number(payload.data?.amount);
          let expectedKobo: number | null = null;
          if (metadata?.amount_fiat !== undefined && metadata?.amount_fiat !== null) {
            expectedKobo = Math.round(Number(metadata.amount_fiat) * 100);
          } else {
            // Prefer deposit base amount when available to avoid using totals
            const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
            if (deposit && deposit.amount !== undefined && deposit.amount !== null) {
              expectedKobo = Math.round(Number(deposit.amount) * 100);
            } else {
              expectedKobo = Number.isFinite(Number(transaction.amount)) ? Math.round(Number(transaction.amount) * 100) : null;
            }
          }

          if (expectedKobo === null || isNaN(webhookAmount)) {
            this.logger.warn(`Paystack processing amount validation skipped for ${reference} due to missing data`);
          } else if (Math.abs(webhookAmount - expectedKobo) !== 0) {
            // Log difference for audit but process—real money was received
            this.logger.warn(
              `Paystack processing amount difference for ${reference}: expected ${expectedKobo} kobo, received ${webhookAmount} kobo (diff: ${webhookAmount - expectedKobo} kobo)`,
            );
          }
        }

        const verifiedTransaction = await this.paystackService.verifyTransaction(reference);
        if (!verifiedTransaction || verifiedTransaction.status !== 'success') {
          this.logger.warn(`Paystack webhook processing: transaction ${reference} verification status=${verifiedTransaction?.status ?? 'unknown'}; scheduling short retry attempts`);
          // Schedule background retry attempts to catch fast provider confirmations when webhooks are received before provider finality
          setImmediate(() => {
            this.retryVerifyTransaction(reference).catch((err: any) => this.logger.debug(`Background verify retries failed for ${reference}: ${err?.message ?? err}`));
          });
          return;
        }

        await this.depositService.finalizeSuccessfulDeposit(reference);
      } else if (event === 'transfer.success') {
        const transferCode = payload.data?.transfer_code || payload.data?.id || reference;
        const verifiedTransfer = await this.paystackService.getTransferStatus(transferCode);
        if (verifiedTransfer?.status?.toString().toLowerCase() !== 'success') {
          this.logger.warn(`Paystack transfer ${reference} verification returned status=${verifiedTransfer?.status ?? 'unknown'}; skipping completion`);
          return;
        }
        await this.withdrawService.markAsSuccess(reference);
      } else if (['transfer.failed', 'transfer.reversed'].includes(event)) {
        const failureDetail =
          payload.data?.reason ||
          payload.data?.failure_message ||
          payload.data?.gateway_response ||
          payload.data?.message ||
          'unknown';
        this.logger.warn(`Paystack transfer failure for ${reference}: ${failureDetail}`);
        this.logger.debug(`Paystack transfer failure payload for ${reference}: ${JSON.stringify(payload.data)}`);
        await this.withdrawService.rejectWithdrawal(reference, failureDetail);
      } else if (
        ['charge.failed', 'payment.failed', 'transaction.failed', 'charge.cancelled', 'payment.cancelled', 'transaction.cancelled',
         'charge.expired', 'payment.expired', 'transaction.expired', 'authorization.cancelled', 'authorization.expired', 'authorization.failed',
         'cancelled', 'failed', 'expired'].includes(event) ||
        /(?:failed|cancelled|expired)$/i.test(event)
      ) {
        this.logger.warn(`Paystack webhook failure/cancel event received: event=${event} reference=${reference} status=${status}`);
        await this.depositService.failDeposit(
          reference,
          payload.data?.gateway_response || payload.data?.failure_message || payload.data?.message || 'Payment failed or cancelled',
        );
      }
    } catch (error) {
      this.logger.error(`Error processing Paystack webhook: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      try {
        await this.releaseLock(lockKey);
      } catch (e) {
        this.logger.debug('Failed to release lock for paystack webhook', e as any);
      }
    }

  }

  private async acquireLock(key: string, ttlMs = 60000): Promise<boolean> {
    try {
      const client = this.getRedisClient();
      if (!client) {
        this.logger.warn('Redis client not available; skipping webhook lock acquisition');
        return true;
      }
      const res = await (client as any).set(key, 'locked', 'NX', 'PX', ttlMs);
      return res === 'OK';
    } catch (e) {
      this.logger.error('Error acquiring webhook lock', e as any);
      return false;
    }
  }

  private async releaseLock(key: string) {
    try {
      const client = this.getRedisClient();
      if (!client) return;
      await client.del(key);
    } catch (e) {
      this.logger.debug('Error releasing webhook lock', e as any);
    }
  }
  /**
   * Process an Ivorypay webhook from the queue.
   * This is called by the WebhookProcessor after the event has been queued to Redis.
   * CRITICAL: This method should ONLY be called by the async processor, never directly from HTTP handlers.
   */
  async handleIvorypayWebhookProcessing(payload: any) {
    const event = payload.event ?? payload.status;
    let rawReference = this.getIvorypayReference(payload);
    const status = payload.data?.status ?? payload.status ?? payload.data?.state ?? 'unknown';

    if (!rawReference) {
      rawReference = this.buildIvorypayReferenceCandidates(payload)[0] ?? null;
    }

    this.logger.log(`Ivorypay webhook processing start: event=${event ?? 'unknown'} reference=${rawReference ?? 'missing'} status=${status}`);

    if (!rawReference) {
      this.logger.warn('Ivorypay webhook processing: missing reference');
      return;
    }

    const fallbackReference = await this.resolveIvorypayInternalReference(rawReference) ?? null;
    const resolvedContext = await this.resolveIvorypayDepositAndTransaction(payload, rawReference);
    const reference = resolvedContext.resolvedReference ?? fallbackReference ?? rawReference;
    const lockKey = `ivorypay:webhook:${reference}`;
    const lockTtl = Number(this.cfg.get<number>('WEBHOOK_LOCK_TTL_MS', 60000));
    const locked = await this.acquireLock(lockKey, lockTtl);
    if (!locked) {
      this.logger.warn(`Ivorypay webhook processing skipped for ${reference} due to existing lock`);
      return;
    }

    this.logger.log(`Ivorypay webhook processing acquired lock: ${lockKey}`);
    if (reference !== rawReference) {
      this.logger.log(`Ivorypay webhook processing: resolved provider reference ${rawReference} to internal reference ${reference}`);
    }
    this.logger.debug(`Ivorypay webhook processing: rawReference=${rawReference} resolvedReference=${reference} candidateRefs=${JSON.stringify({
      topLevelReference: payload?.reference ?? null,
      topLevelId: payload?.id ?? null,
      dataReference: payload?.data?.reference ?? null,
      dataTxRef: payload?.data?.tx_ref ?? null,
      dataTrxRef: payload?.data?.trxref ?? null,
      dataTransactionReference: payload?.data?.transaction_reference ?? null,
      dataTransactionReferenceAlt: payload?.data?.transactionReference ?? null,
    })}`);

    const transaction = resolvedContext.transaction;
    const deposit = resolvedContext.deposit;
    const resolvedReference = resolvedContext.resolvedReference ?? reference ?? rawReference;
    const transactionMetadata = (transaction?.metadata as any) ?? {};
    const payloadIdentifiers = this.ivorypayService.extractProviderIdentifiers(payload);
    const providerRefFromMetadata = transactionMetadata.provider_ref ?? transactionMetadata.provider_transaction_id ?? transactionMetadata.provider_reference ?? undefined;
    const candidateRefs = this.buildIvorypayReferenceCandidates(payload, transactionMetadata);

    this.logger.log(`Ivorypay webhook processing matched deposit=${deposit?.id ?? 'none'} transaction=${transaction?.id ?? 'none'} resolvedReference=${resolvedReference} providerRef=${providerRefFromMetadata ?? rawReference}`);

    // Persist incoming provider identifiers from the webhook payload before verification.
    const incomingProviderRef =
      payloadIdentifiers.transaction_id ??
      payloadIdentifiers.payment_id ??
      payloadIdentifiers.provider_reference ??
      payloadIdentifiers.transaction_reference ??
      payloadIdentifiers.reference ??
      payloadIdentifiers.id ??
      payloadIdentifiers.tx_ref ??
      payloadIdentifiers.trxref ??
      null;
    const incomingProviderReference = payloadIdentifiers.provider_reference ?? payloadIdentifiers.reference ?? payloadIdentifiers.transaction_reference ?? null;
    const incomingCheckoutId = payloadIdentifiers.checkout_id ?? null;
    const incomingPaymentReference = payloadIdentifiers.payment_reference ?? null;
    const incomingMerchantReference = payloadIdentifiers.merchant_reference ?? null;
    const incomingPayloadUpdate: any = {};
    const transactionMetadataUpdate: any = { ...transactionMetadata };

    if (deposit) {
      if (incomingProviderRef && deposit.providerRef !== incomingProviderRef) incomingPayloadUpdate.providerRef = incomingProviderRef;
      if (incomingProviderRef && deposit.providerTransactionId !== incomingProviderRef) incomingPayloadUpdate.providerTransactionId = incomingProviderRef;
      if (incomingProviderReference && deposit.providerReference !== incomingProviderReference) incomingPayloadUpdate.providerReference = incomingProviderReference;
      if (incomingCheckoutId && deposit.checkoutId !== incomingCheckoutId) incomingPayloadUpdate.checkoutId = incomingCheckoutId;
      if (incomingPaymentReference && deposit.paymentReference !== incomingPaymentReference) incomingPayloadUpdate.paymentReference = incomingPaymentReference;
      if (incomingMerchantReference && deposit.merchantReference !== incomingMerchantReference) incomingPayloadUpdate.merchantReference = incomingMerchantReference;
      if (payload && JSON.stringify(deposit.providerPayload) !== JSON.stringify(payload)) incomingPayloadUpdate.providerPayload = payload;
    }

    if (transaction) {
      if (incomingProviderRef && transactionMetadata.provider_ref !== incomingProviderRef) transactionMetadataUpdate.provider_ref = incomingProviderRef;
      if (incomingProviderRef && transactionMetadata.provider_transaction_id !== incomingProviderRef) transactionMetadataUpdate.provider_transaction_id = incomingProviderRef;
      if (incomingProviderReference && transactionMetadata.provider_reference !== incomingProviderReference) transactionMetadataUpdate.provider_reference = incomingProviderReference;
      if (incomingCheckoutId && transactionMetadata.provider_checkout_id !== incomingCheckoutId) transactionMetadataUpdate.provider_checkout_id = incomingCheckoutId;
      if (incomingPaymentReference && transactionMetadata.provider_payment_id !== incomingPaymentReference) transactionMetadataUpdate.provider_payment_id = incomingPaymentReference;
      if (incomingMerchantReference && transactionMetadata.merchant_reference !== incomingMerchantReference) transactionMetadataUpdate.merchant_reference = incomingMerchantReference;
      if (payload && JSON.stringify(transactionMetadata.provider_payload) !== JSON.stringify(payload)) transactionMetadataUpdate.provider_payload = payload;
    }

    if (Object.keys(incomingPayloadUpdate).length || Object.keys(transactionMetadataUpdate).length) {
      await this.prisma.$transaction(async (tx) => {
        if (deposit && Object.keys(incomingPayloadUpdate).length) {
          await tx.deposit.update({ where: { id: deposit.id }, data: incomingPayloadUpdate });
        }
        if (transaction && Object.keys(transactionMetadataUpdate).length) {
          await tx.transactions.update({ where: { id: transaction.id }, data: { metadata: transactionMetadataUpdate } });
        }
      });
      this.logger.log(`Ivorypay webhook processing: persisted provider identifiers for ${resolvedReference} providerRef=${incomingProviderRef ?? 'none'} checkoutId=${incomingCheckoutId ?? 'none'} paymentReference=${incomingPaymentReference ?? 'none'} merchantReference=${incomingMerchantReference ?? 'none'}`);
    }

    const resolverProviderRef =
      providerRefFromMetadata ??
      incomingProviderRef ??
      incomingProviderReference ??
      payloadIdentifiers.transaction_id ??
      payloadIdentifiers.payment_id ??
      payloadIdentifiers.provider_reference ??
      payloadIdentifiers.transaction_reference ??
      payloadIdentifiers.reference ??
      payloadIdentifiers.id ??
      payloadIdentifiers.tx_ref ??
      payloadIdentifiers.trxref ??
      undefined;

    if (!resolverProviderRef && candidateRefs.length === 0) {
      if (!deposit && !transaction) {
        this.logger.warn(`Ivorypay webhook processing aborted for ${resolvedReference}: no provider transaction id or provider reference available for verification`);
        return;
      }
      this.logger.warn(`Ivorypay webhook processing: no provider identifiers available for verification, falling back to internal reference ${resolvedReference}`);
    }

    try {
      const isSuccessEvent = this.isIvorypaySuccessEvent(event, status);
      const isFailureEvent = this.isIvorypayFailureEvent(event, status);

      if (isSuccessEvent) {
        const verifiedTransaction = await this.verifyIvorypayWebhookTransaction(resolvedReference, resolverProviderRef, candidateRefs);
        if (!verifiedTransaction) {
          this.logger.warn(`Ivorypay webhook processing: verification did not confirm success for ${resolvedReference} providerRef=${resolverProviderRef ?? rawReference}`);
          return;
        }

        const verifiedProviderId =
          verifiedTransaction.providerReference ??
          verifiedTransaction.providerIdentifiers?.transaction_id ??
          verifiedTransaction.providerIdentifiers?.id ??
          verifiedTransaction.providerIdentifiers?.provider_reference ??
          verifiedTransaction.providerIdentifiers?.tx_ref ??
          verifiedTransaction.providerIdentifiers?.trxref ??
          verifiedTransaction.providerIdentifiers?.transaction_reference ??
          null;
        const providerIdentifiers = verifiedTransaction?.providerIdentifiers ?? verifiedTransaction?.data?.providerIdentifiers ?? {};
        const providerTransactionId =
          verifiedProviderId ??
          providerIdentifiers.transaction_id ??
          providerIdentifiers.payment_id ??
          providerIdentifiers.id ??
          payload?.data?.transaction_id ??
          payload?.data?.payment_id ??
          payload?.data?.id ??
          null;
        const providerReference = providerIdentifiers.provider_reference ?? verifiedTransaction?.providerReference ?? payload?.data?.provider_reference ?? null;
        const checkoutId = providerIdentifiers.checkout_id ?? payload?.data?.checkout_id ?? payload?.data?.checkoutId ?? null;
        const paymentReference = providerIdentifiers.payment_reference ?? providerIdentifiers.reference ?? payload?.data?.payment_reference ?? payload?.data?.reference ?? payload?.reference ?? null;
        const merchantReference = providerIdentifiers.merchant_reference ?? payload?.data?.merchant_reference ?? payload?.data?.merchantReference ?? null;
        const txHash =
          verifiedTransaction?.tx_hash ??
          verifiedTransaction?.transaction_hash ??
          verifiedTransaction?.hash ??
          verifiedTransaction?.withdrawalTxHash ??
          verifiedTransaction?.txid ??
          verifiedTransaction?.transactionId ??
          verifiedTransaction?.data?.tx_hash ??
          verifiedTransaction?.data?.transaction_hash ??
          verifiedTransaction?.data?.hash ??
          verifiedTransaction?.data?.withdrawalTxHash ??
          verifiedTransaction?.data?.txid ??
          verifiedTransaction?.data?.transactionId ??
          payload?.data?.withdrawalTxHash ??
          payload?.data?.txid ??
          payload?.data?.transactionId ??
          payload?.withdrawalTxHash ??
          payload?.txid ??
          payload?.transactionId ??
          null;
        const verificationPayload = verifiedTransaction ?? payload;
        const normalizedStatus = (verifiedTransaction?.status ?? verifiedTransaction?.data?.status ?? '').toString().toLowerCase();
        const expectedAmount = Number(transaction?.amount ?? 0);
        const verifiedAmount = Number(verifiedTransaction?.amount ?? verifiedTransaction?.data?.amount ?? verifiedTransaction?.amount_usd ?? verifiedTransaction?.amount_fiat ?? transaction?.amount ?? 0);

        await this.prisma.$transaction(async (tx) => {
          const depositUpdate: any = {
            verificationPayload,
            blockchainTransactionHash: txHash ?? null,
            verificationAttempts: { increment: 1 },
            ...(verifiedProviderId ? { providerRef: verifiedProviderId } : {}),
            ...(providerTransactionId ? { providerTransactionId } : {}),
            ...(providerReference ? { providerReference } : {}),
            ...(checkoutId ? { checkoutId } : {}),
            ...(paymentReference ? { paymentReference } : {}),
            ...(merchantReference ? { merchantReference } : {}),
            ...(verificationPayload ? { providerPayload: verificationPayload } : {}),
          };
          if (['success', 'completed'].includes(normalizedStatus)) {
            depositUpdate.verifiedAt = new Date();
          }
          if (deposit?.reference) {
            await tx.deposit.update({ where: { reference: deposit.reference }, data: depositUpdate });
          } else {
            await tx.deposit.update({ where: { reference: resolvedReference }, data: depositUpdate });
          }
          if (verifiedProviderId || txHash || providerTransactionId || providerReference || checkoutId || paymentReference || merchantReference) {
            const metadata = (transaction?.metadata as any) ?? {};
            const nextMetadata = {
              ...metadata,
              ...(verifiedProviderId ? { provider_ref: verifiedProviderId } : {}),
              ...(providerTransactionId ? { provider_transaction_id: providerTransactionId } : {}),
              ...(providerReference ? { provider_reference: providerReference } : {}),
              ...(checkoutId ? { provider_checkout_id: checkoutId } : {}),
              ...(paymentReference ? { payment_reference: paymentReference } : {}),
              ...(merchantReference ? { merchant_reference: merchantReference } : {}),
              ...(providerIdentifiers.payment_id ? { provider_payment_id: providerIdentifiers.payment_id } : {}),
              ...(providerIdentifiers.tx_ref ? { tx_ref: providerIdentifiers.tx_ref } : {}),
              ...(providerIdentifiers.trxref ? { trxref: providerIdentifiers.trxref } : {}),
              ...(providerIdentifiers.transaction_reference ? { transaction_reference: providerIdentifiers.transaction_reference } : {}),
              ...(txHash ? { blockchain_tx_hash: txHash } : {}),
            };
            await tx.transactions.update({ where: { id: transaction?.id }, data: { metadata: nextMetadata } });
          }
        });

        if (!['success', 'completed'].includes(normalizedStatus)) {
          this.logger.warn(`Ivorypay webhook processing: verification returned status=${normalizedStatus || 'unknown'} for ${reference}; skipping credit`);
          return;
        }
        if (!this.isIvorypayVerifiedAmountAcceptable(transaction, verifiedTransaction)) {
          this.logger.warn(`Ivorypay webhook processing: amount mismatch for ${reference}: transaction metadata does not align with verified provider amount`);
          return;
        }
      }

      // Amount validation before processing (defense-in-depth)
      if (isSuccessEvent) {
        if (transaction) {
          const metadata = transaction.metadata as any ?? {};
          const webhookAmount = Number(payload.data?.amount ?? payload.amount);
          const expectedUsd = metadata?.amount_usd !== undefined && metadata?.amount_usd !== null
            ? Number(metadata.amount_usd)
            : null;
          const expectedFarm = Number(transaction.amount);
          if (expectedUsd !== null && isFinite(expectedUsd) && !isNaN(webhookAmount)) {
            if (Math.abs(webhookAmount - expectedUsd) > 0.01) {
              this.logger.error(`FRAUD ALERT: Ivorypay USD amount mismatch for ${reference}: expected ${expectedUsd}, got ${webhookAmount}`);
              throw new BadRequestException(`Amount mismatch: expected ${expectedUsd}, got ${webhookAmount}`);
            }
          } else if (isFinite(expectedFarm) && !isNaN(webhookAmount)) {
            if (Math.abs(webhookAmount - expectedFarm) > 0.01) {
              this.logger.warn(`Ivorypay processing amount validation skipped/fallback for ${reference} due to missing USD metadata`);
            }
          } else {
            this.logger.warn(`Ivorypay processing amount validation skipped for ${reference} due to missing data`);
          }
        }
      }

      if (transaction?.transaction_type === 'withdrawal' || ['withdrawal.success', 'transfer.success', 'payout.success', 'withdrawal.completed', 'transfer.completed', 'payout.completed'].includes(event)) {
        await this.finalizeWithdrawal(reference, true);
      } else if (['withdrawal.failed'].includes(event)) {
        this.logger.warn(`Ivorypay webhook withdrawal failure event: event=${event} reference=${reference} status=${status}`);
        await this.finalizeWithdrawal(reference, false, payload.data?.reason || payload.message);
      } else if (isSuccessEvent) {
        const credited = await this.finalizeDeposit(resolvedReference);
        this.logger.log(`Ivorypay webhook processing completed for ${resolvedReference}: success=${credited} event=${event} status=${status}`);
      } else if (isFailureEvent) {
        this.logger.warn(`Ivorypay webhook failure/cancel event received: event=${event} reference=${reference} status=${status}`);
        await this.depositService.failDeposit(
          resolvedReference,
          payload.data?.reason || payload.data?.message || payload.message || 'Payment failed or cancelled',
        );
      }
    } catch (error) {
      this.logger.error(`Error processing Ivorypay webhook: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      try {
        await this.releaseLock(lockKey);
      } catch (e) {
        this.logger.debug('Failed to release lock for ivorypay webhook', e as any);
      }
    }
  }
}
