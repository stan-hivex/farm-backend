import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { FeesService } from '../fees/fees.service';
import { feeFor } from '../fees/fee-defaults';

export const NFC_TOKEN_PREFIX = 'farmpay1';
export const NFC_TTL_SECONDS = 60;
export const NFC_MAX_TTL_SECONDS = 120;

/**
 * Tap-to-pay. The payee's phone emits a short-lived, single-use token signed by
 * the backend (over NFC HCE, or as a QR code). The payer's phone sends the
 * token back here: amount and payee ALWAYS come from the database row, never
 * from the tag. Off unless NFC_PAY_ENABLED=true.
 */
@Injectable()
export class NfcPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    @Optional() private readonly fees?: FeesService,
  ) {}

  enabled() {
    return process.env.NFC_PAY_ENABLED === 'true';
  }
  private assertEnabled() {
    if (!this.enabled())
      throw new ForbiddenException('Tap to pay is not enabled');
  }
  private secret() {
    const s = process.env.NFC_PAY_SECRET || process.env.JWT_SECRET;
    if (!s || s.length < 16)
      throw new ForbiddenException('Tap to pay is not configured');
    return s;
  }

  sign(id: string, exp: number) {
    const sig = createHmac('sha256', this.secret())
      .update(`${NFC_TOKEN_PREFIX}.${id}.${exp}`)
      .digest('base64url');
    return `${NFC_TOKEN_PREFIX}.${id}.${exp}.${sig}`;
  }

  /** Verifies format + signature + expiry. Returns the request id. */
  verify(token: string, now = Date.now()): string {
    const parts = String(token ?? '')
      .trim()
      .split('.');
    if (parts.length !== 4 || parts[0] !== NFC_TOKEN_PREFIX)
      throw new BadRequestException('Not a FARM payment request');
    const [, id, expS, sig] = parts;
    const exp = Number(expS);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(exp))
      throw new BadRequestException('Not a FARM payment request');
    const good = this.sign(id, exp).split('.')[3];
    const a = Buffer.from(sig);
    const b = Buffer.from(good);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new BadRequestException('Payment request signature is invalid');
    if (exp * 1000 <= now)
      throw new GoneException('This payment request has expired');
    return id;
  }

  private async payeeInfo(userId: string) {
    const [u, biz] = await Promise.all([
      this.prisma.users.findUnique({
        where: { id: userId },
        select: { username: true, first_name: true, last_name: true },
      }),
      this.prisma.businesses.findFirst({
        where: { owner_user_id: userId, status: 'approved' as any },
        select: { trading_name: true, legal_name: true },
      }),
    ]);
    return {
      username: u?.username ?? null,
      name:
        biz?.trading_name ||
        biz?.legal_name ||
        [u?.first_name, u?.last_name].filter(Boolean).join(' ') ||
        u?.username ||
        'FARM user',
      is_merchant: !!biz,
    };
  }

  /** Payee creates a request. Kind is decided server-side (approved business = merchant). */
  async create(
    payeeId: string,
    dto: { amount: number; description?: string; ttl_seconds?: number },
  ) {
    this.assertEnabled();
    const amount = Number(dto.amount);
    if (!(amount > 0) || !Number.isFinite(amount))
      throw new BadRequestException('Amount must be greater than zero');
    const ttl = Math.min(
      NFC_MAX_TTL_SECONDS,
      Math.max(15, Math.floor(Number(dto.ttl_seconds) || NFC_TTL_SECONDS)),
    );
    const payee = await this.payeeInfo(payeeId);
    const expires = new Date(Date.now() + ttl * 1000);
    const row = await this.prisma.nfc_payment_requests.create({
      data: {
        payee_user_id: payeeId,
        amount: Number(amount.toFixed(2)),
        kind: payee.is_merchant ? 'merchant' : 'p2p',
        description: dto.description?.trim().slice(0, 140) || null,
        expires_at: expires,
      },
    });
    const exp = Math.floor(expires.getTime() / 1000);
    const token = this.sign(row.id, exp);
    return {
      data: {
        id: row.id,
        token,
        amount: Number(row.amount),
        kind: row.kind,
        expires_at: expires.toISOString(),
        ttl_seconds: ttl,
        ...(await this.quote(row.kind, Number(row.amount))),
      },
    };
  }

  private async quote(kind: string, amount: number) {
    if (kind === 'merchant') {
      const merchantFee = await feeFor(this.fees, 'merchant', amount);
      return {
        payer_fee: 0,
        payer_total: amount,
        merchant_fee: merchantFee,
        payee_receives: Number((amount - merchantFee).toFixed(2)),
        fee_key: 'merchant',
      };
    }
    const fee = await feeFor(this.fees, 'transfer', amount);
    return {
      payer_fee: fee,
      payer_total: Number((amount + fee).toFixed(2)),
      merchant_fee: 0,
      payee_receives: amount,
      fee_key: 'transfer',
    };
  }

  private async load(token: string) {
    const id = this.verify(token);
    const row = await this.prisma.nfc_payment_requests.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Payment request not found');
    // Signed expiry and stored expiry must agree (tampered exp can't pass the HMAC anyway).
    if (row.expires_at.getTime() <= Date.now())
      throw new GoneException('This payment request has expired');
    return row;
  }

  /** Payer side: resolve what the tag/QR points at. Read-only. */
  async resolve(payerId: string, token: string) {
    this.assertEnabled();
    const row = await this.load(token);
    if (row.used_at)
      throw new ConflictException('This request was already paid');
    if (row.payee_user_id === payerId)
      throw new BadRequestException('You cannot pay your own request');
    const amount = Number(row.amount);
    return {
      data: {
        id: row.id,
        payee: await this.payeeInfo(row.payee_user_id),
        amount,
        kind: row.kind,
        description: row.description,
        expires_at: row.expires_at.toISOString(),
        ...(await this.quote(row.kind, amount)),
      },
    };
  }

  /** Payer confirms with PIN. Single use and idempotent for the same payer. */
  async pay(payerId: string, dto: { token: string; pin?: string }, ip: string) {
    this.assertEnabled();
    const row = await this.load(dto.token).catch(async (e) => {
      // A replay after expiry by the payer who already paid gets the same receipt.
      const prior = await this.priorReceipt(payerId, dto.token);
      if (prior) return prior;
      throw e;
    });
    if (row.used_at) {
      if (row.payer_user_id === payerId && row.transaction_reference)
        return this.receipt(row, true);
      throw new ConflictException('This request was already paid');
    }
    if (row.payee_user_id === payerId)
      throw new BadRequestException('You cannot pay your own request');
    const claim = await this.prisma.nfc_payment_requests.updateMany({
      where: { id: row.id, used_at: null, expires_at: { gt: new Date() } },
      data: { used_at: new Date(), payer_user_id: payerId },
    });
    if (!claim.count) {
      const now = await this.prisma.nfc_payment_requests.findUnique({
        where: { id: row.id },
      });
      if (now?.payer_user_id === payerId && now.transaction_reference)
        return this.receipt(now, true);
      throw new ConflictException('This request was already paid or expired');
    }
    const w = await this.prisma.wallets.findFirst({
      where: { user_id: row.payee_user_id, is_active: true },
    });
    let res: any;
    try {
      if (!w?.wallet_address)
        throw new BadRequestException('Payee wallet not found');
      res = await this.wallets.sendFunds(
        payerId,
        {
          recipient_identifier: w.wallet_address,
          amount: Number(row.amount),
          pin: dto.pin,
          description: row.description || 'Tap to pay',
        },
        ip,
        row.kind === 'merchant' ? { merchantFee: true } : undefined,
      );
    } catch (e) {
      // Release the claim so a wrong PIN or low balance can be retried before expiry.
      await this.prisma.nfc_payment_requests.updateMany({
        where: {
          id: row.id,
          payer_user_id: payerId,
          transaction_reference: null,
        },
        data: { used_at: null, payer_user_id: null },
      });
      throw e;
    }
    const ref = res?.data?.transaction_reference ?? null;
    const done = await this.prisma.nfc_payment_requests.update({
      where: { id: row.id },
      data: { transaction_reference: ref },
    });
    return this.receipt(done, false, res?.data);
  }

  private async priorReceipt(payerId: string, token: string) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 4) return null;
    try {
      // Signature must still be valid; only expiry is ignored for the replay check.
      const good = this.sign(parts[1], Number(parts[2])).split('.')[3];
      if (good !== parts[3]) return null;
    } catch {
      return null;
    }
    const row = await this.prisma.nfc_payment_requests.findUnique({
      where: { id: parts[1] },
    });
    return row && row.payer_user_id === payerId && row.transaction_reference
      ? row
      : null;
  }

  private receipt(row: any, replay: boolean, tx?: any) {
    return {
      data: {
        id: row.id,
        amount: Number(row.amount),
        kind: row.kind,
        transaction_reference: row.transaction_reference,
        fee: tx?.fee ?? undefined,
        merchant_fee: tx?.merchant_fee ?? undefined,
        replay,
      },
      message: replay ? 'Already paid' : 'Payment sent',
    };
  }

  /** Payee polls this to see when the tap was paid. */
  async status(payeeId: string, id: string) {
    const row = await this.prisma.nfc_payment_requests.findUnique({
      where: { id },
    });
    if (!row || row.payee_user_id !== payeeId)
      throw new NotFoundException('Payment request not found');
    return {
      data: {
        id: row.id,
        amount: Number(row.amount),
        status: row.transaction_reference
          ? 'paid'
          : row.expires_at.getTime() <= Date.now()
            ? 'expired'
            : 'pending',
        transaction_reference: row.transaction_reference,
        expires_at: row.expires_at.toISOString(),
      },
    };
  }
}
