import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { WithdrawService } from '../withdraw/withdraw.service';
import { BusinessWebhooksService } from '../business-ops/business-webhooks.service';
import { ApiPayoutDto } from './business-api.dto';

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_\-:.]{8,255}$/;

/**
 * Live payouts requested through the business API. They go through
 * WithdrawService.createWithdrawal exactly like an app withdrawal (atomic
 * balance lock, daily limits, address validation, automatic payout, no admin
 * step). The live API key with payouts:write replaces the PIN. Every request
 * needs an Idempotency-Key; repeats return the original result.
 */
@Injectable()
export class ApiPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly withdraw: WithdrawService,
    private readonly webhooks: BusinessWebhooksService,
  ) {}

  static hash(dto: ApiPayoutDto) {
    const keys = Object.keys(dto).sort();
    return createHash('sha256')
      .update(JSON.stringify(keys.map((k) => [k, (dto as any)[k]])))
      .digest('hex');
  }

  async create(
    ctx: { businessId: string; ownerUserId: string; keyId: string },
    dto: ApiPayoutDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey))
      throw new BadRequestException(
        'An Idempotency-Key header (8-255 letters, digits, - _ : .) is required for live payouts',
      );
    const biz = await this.prisma.businesses.findUnique({
      where: { id: ctx.businessId },
      select: {
        status: true,
        merchant_id: true,
        merchant: { select: { status: true } },
      },
    });
    if (biz?.status !== 'approved' || biz.merchant?.status !== 'approved')
      throw new ForbiddenException(
        'Live payouts need an approved business and merchant account',
      );

    const requestHash = ApiPayoutsService.hash(dto);
    const where = {
      business_id_idempotency_key: {
        business_id: ctx.businessId,
        idempotency_key: idempotencyKey,
      },
    };
    // Claim the idempotency key atomically (unique index).
    let record: any;
    try {
      record = await this.prisma.business_api_payouts.create({
        data: {
          business_id: ctx.businessId,
          api_key_id: ctx.keyId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
        },
      });
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      const existing = await this.prisma.business_api_payouts.findUnique({
        where,
      });
      if (!existing) throw new ConflictException('Try again');
      if (existing.request_hash !== requestHash)
        throw new ConflictException(
          'This Idempotency-Key was used with a different request',
        );
      if (existing.status === 'submitted')
        return { ...(existing.response as any), idempotent_replay: true };
      if (existing.status === 'processing')
        throw new ConflictException(
          'A payout with this Idempotency-Key is still being processed',
        );
      // failed before any money moved: allow a retry, but only one at a time
      const retry = await this.prisma.business_api_payouts.updateMany({
        where: { id: existing.id, status: 'failed' },
        data: { status: 'processing', error: null },
      });
      if (!retry.count)
        throw new ConflictException(
          'A payout with this Idempotency-Key is still being processed',
        );
      record = existing;
    }

    try {
      const res: any = await this.withdraw.createWithdrawal(
        ctx.ownerUserId,
        {
          amount: dto.amount,
          method: dto.method,
          accountName: dto.account_name,
          accountNumber: dto.account_number,
          bankName: dto.bank_name,
          phoneNumber: dto.phone_number,
          cryptoAddress: dto.crypto_address,
          cryptoAsset: dto.crypto_currency,
          network: dto.network,
          extra_id: dto.extra_id,
        },
        { preAuthorized: `business_api_key:${ctx.keyId}` },
      );
      const w = res?.withdrawal ?? {};
      const response = {
        data: {
          id: w.id ?? null,
          reference: res?.reference,
          amount: Number(w.amount ?? dto.amount),
          fee: Number(w.fee ?? 0),
          settlement: Number(w.settlement ?? 0),
          method: dto.method,
          status: res?.status ?? 'PROCESSING',
        },
        message: 'Payout submitted for automatic processing',
      };
      await this.prisma.business_api_payouts.update({
        where: { id: record.id },
        data: {
          status: 'submitted',
          withdrawal_reference: res?.reference ?? null,
          response,
        },
      });
      await this.prisma.audit_logs
        .create({
          data: {
            user_id: ctx.ownerUserId,
            action: 'business.api_payout',
            entity_type: 'business',
            entity_id: ctx.businessId,
            new_values: {
              reference: res?.reference,
              amount: dto.amount,
              api_key_id: ctx.keyId,
            },
          } as any,
        })
        .catch(() => undefined);
      this.webhooks.emit(ctx.businessId, 'live', 'payout.requested', {
        reference: res?.reference,
        amount: dto.amount,
        method: dto.method,
        status: response.data.status,
      });
      return response;
    } catch (e: any) {
      await this.prisma.business_api_payouts.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          error: String(e?.message ?? e).slice(0, 500),
        },
      });
      throw e;
    }
  }
}
