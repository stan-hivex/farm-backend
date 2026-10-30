import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import algosdk from 'algosdk';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { BusinessWebhooksService } from '../business-ops/business-webhooks.service';
import { openSecret, sealSecret } from '../chain-wallet/key-vault';
import { X402Chain } from './x402-chain';
import { fromUnits, toUnits, x402Config, X402Config } from './x402-config';
import { assertSafeUrl, safeFetch } from './safe-fetch';

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}
export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  payload: { paymentGroup: string[]; paymentIndex: number };
  resource?: unknown;
}
export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  /** internal only: never serialized to callers */
  group?: Uint8Array[];
  txId?: string;
  sponsored?: boolean;
}
export interface SettleMeta {
  source: 'gateway' | 'facilitator';
  businessId: string;
  resourceId?: string;
  apiKeyId?: string;
}

const METHODS = ['GET', 'POST', 'ANY'];
const bad = (invalidReason: string, invalidMessage: string, payer?: string): VerifyResult => ({ isValid: false, invalidReason, invalidMessage, payer });
const b64json = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const signed = (s: algosdk.SignedTransaction) => !!(s.sig || s.msig || s.lsig || (s as any).pqsig);

/**
 * x402 v2, `exact` scheme on Algorand (ASA transfers in an atomic group).
 * Flow: 402 requirement -> client signs payment -> FARM verifies (checks + node
 * simulate) -> service runs -> FARM settles on chain. FARM only ever signs its
 * own optional fee-payer txn; it can never redirect the payer's funds.
 * Payments land in the business owner's FARM custodial address, and the
 * existing deposit poller credits them to the ledger (no double credit here).
 */
@Injectable()
export class X402Service {
  private readonly log = new Logger(X402Service.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: X402Chain,
    private readonly access: BusinessAccessService,
    private readonly webhooks: BusinessWebhooksService,
  ) {}

  cfg(): X402Config {
    return x402Config();
  }
  private ensure() {
    const c = this.cfg();
    if (!c.enabled) throw new ServiceUnavailableException('x402 payments are not enabled');
    return c;
  }
  status() {
    const c = this.cfg();
    return {
      enabled: c.enabled,
      network: c.caip2 || null,
      assets: Object.keys(c.assets),
      fee_sponsorship: c.enabled && c.feePayer,
      missing: c.enabled ? [] : [...c.missing, ...c.problems],
    };
  }
  supported() {
    const c = this.ensure();
    return {
      kinds: [{ x402Version: 2, scheme: 'exact', network: c.caip2 }],
      extensions: [],
      signers: c.feePayer ? { 'algorand:*': [this.chain.feePayerAddress()] } : {},
    };
  }

  // ---------- requirements ----------
  requirementsFor(r: { asset: string; price_units: bigint; pay_to: string }): PaymentRequirements {
    const c = this.ensure();
    const assetId = c.assets[r.asset as 'FARM' | 'USDC'];
    if (assetId === undefined) throw new ServiceUnavailableException(`${r.asset} is not configured`);
    return {
      scheme: 'exact',
      network: c.caip2,
      amount: r.price_units.toString(),
      asset: assetId.toString(),
      payTo: r.pay_to,
      maxTimeoutSeconds: c.timeoutSeconds,
      extra: { name: r.asset, decimals: r.asset === 'USDC' ? 6 : 2, ...(c.feePayer ? { feePayer: this.chain.feePayerAddress() } : {}) },
    };
  }

  // ---------- verify (read-only: no DB writes, no broadcast) ----------
  async verify(p: PaymentPayload, req: PaymentRequirements, allowedPayTo?: string): Promise<VerifyResult> {
    const c = this.ensure();
    if (p?.x402Version !== 2) return bad('invalid_x402_version', 'Only x402Version 2 is supported');
    const a = p.accepted;
    if (!a || a.scheme !== 'exact' || req.scheme !== 'exact') return bad('invalid_scheme', 'Only the exact scheme is supported');
    if (a.network !== req.network || req.network !== c.caip2) return bad('invalid_network', `Network must be ${c.caip2}`);
    if (a.amount !== req.amount || a.asset !== req.asset || a.payTo !== req.payTo)
      return bad('invalid_payment_requirements', 'Accepted requirements do not match');
    const assetOk = Object.values(c.assets).some((id) => id.toString() === req.asset);
    if (!assetOk || !/^\d+$/.test(req.amount) || BigInt(req.amount) <= 0n) return bad('invalid_payment_requirements', 'Unsupported asset or amount');
    if (allowedPayTo !== undefined && req.payTo !== allowedPayTo)
      return bad('invalid_payment_requirements', 'payTo must be this business’s FARM account');

    const g = p.payload?.paymentGroup;
    const idx = p.payload?.paymentIndex;
    if (!Array.isArray(g) || g.length < 1 || g.length > 16 || !Number.isInteger(idx) || idx < 0 || idx >= g.length)
      return bad('invalid_payload', 'paymentGroup must have 1-16 txns and a valid paymentIndex');
    let stx: algosdk.SignedTransaction[];
    try {
      stx = g.map((s) => {
        if (typeof s !== 'string' || s.length > 8000) throw new Error('bad');
        return algosdk.decodeSignedTransaction(Buffer.from(s, 'base64'));
      });
    } catch {
      return bad('invalid_payload', 'Could not decode paymentGroup');
    }
    const gh = c.genesisHash;
    if (stx.some((s) => Buffer.from(s.txn.genesisHash ?? []).toString('base64') !== gh)) return bad('invalid_network', 'Transactions are for another network');
    if (stx.length > 1) {
      const want = Buffer.from(algosdk.computeGroupID(stx.map((s) => withoutGroup(s.txn)))).toString('base64');
      if (stx.some((s) => !s.txn.group || Buffer.from(s.txn.group).toString('base64') !== want))
        return bad('invalid_payload', 'Transactions are not one atomic group');
    }
    const pay = stx[idx];
    const t = pay.txn;
    const payer = t.sender.toString();
    const x = t.assetTransfer;
    if (t.type !== 'axfer' || !x) return bad('invalid_payload', 'Payment txn must be an asset transfer', payer);
    if (x.assetIndex.toString() !== req.asset) return bad('invalid_payload', 'Wrong asset', payer);
    if (x.amount.toString() !== req.amount) return bad('invalid_payload', 'Amount does not match exactly', payer);
    if (x.receiver.toString() !== req.payTo) return bad('invalid_payload', 'Receiver does not match payTo', payer);
    if (x.closeRemainderTo || t.rekeyTo || x.assetSender) return bad('invalid_payload', 'Close, rekey and clawback are not allowed', payer);
    if (!signed(pay)) return bad('invalid_payload', 'Payment txn is not signed', payer);
    if (payer === req.payTo) return bad('invalid_payload', 'Payer and payTo are the same', payer);

    let feeAddr: string | null = null;
    if (c.feePayer) feeAddr = this.chain.feePayerAddress();
    const feeIdx: number[] = [];
    let feeTotal = 0n;
    for (let i = 0; i < stx.length; i++) {
      const s = stx[i];
      const from = s.txn.sender.toString();
      if (feeAddr && from === feeAddr) {
        const pm = s.txn.payment;
        if (s.txn.type !== 'pay' || !pm || pm.amount !== 0n || pm.closeRemainderTo || s.txn.rekeyTo || pm.receiver.toString() !== feeAddr || signed(s))
          return bad('invalid_payload', 'Fee-payer txn must be an unsigned 0 ALGO payment to itself', payer);
        feeIdx.push(i);
        feeTotal += BigInt(s.txn.fee);
      } else if (!signed(s)) {
        return bad('invalid_payload', 'Every non-fee-payer txn must be signed by its sender', payer);
      }
    }
    if (feeTotal > c.maxFeeMicroAlgos) return bad('invalid_payload', 'Fee-payer fee is too high', payer);

    const round = await this.chain.currentRound();
    if (BigInt(t.lastValid) < round) return bad('invalid_transaction_state', 'Payment txn has expired', payer);
    if (BigInt(t.firstValid) > round + 10n) return bad('invalid_transaction_state', 'Payment txn is not valid yet', payer);
    const txId = t.txID();
    const used = await this.prisma.x402_payments.findUnique({ where: { network_tx_id: { network: c.caip2, tx_id: txId } } });
    if (used && used.status !== 'failed') return bad('invalid_transaction_state', 'This payment was already used', payer);

    const group: Uint8Array[] = g.map((s) => new Uint8Array(Buffer.from(s, 'base64')));
    if (feeIdx.length) {
      const signer = this.chain.feePayer();
      try {
        const sigs = await signer.sign(feeIdx.map((i) => stx[i].txn));
        feeIdx.forEach((i, k) => (group[i] = sigs[k]));
      } finally {
        signer.wipe();
      }
    }
    let fail: string | null;
    try {
      fail = await this.chain.simulate(group);
    } catch (e: any) {
      return bad('unexpected_verify_error', 'Could not reach the Algorand node', payer);
    }
    if (fail) {
      const reason = /overspend|underflow|insufficient|below min/i.test(fail) ? 'insufficient_funds' : 'invalid_transaction_state';
      return bad(reason, fail, payer);
    }
    return { isValid: true, payer, group, txId, sponsored: feeIdx.length > 0 };
  }

  // ---------- settle ----------
  async settle(p: PaymentPayload, req: PaymentRequirements, meta: SettleMeta, allowedPayTo?: string, verified?: VerifyResult) {
    const c = this.ensure();
    const v = verified ?? (await this.verify(p, req, allowedPayTo));
    const base = { network: c.caip2, payer: v.payer };
    if (!v.isValid || !v.group || !v.txId)
      return { success: false, errorReason: v.invalidReason, errorMessage: v.invalidMessage, transaction: '', ...base };
    const asset = Object.entries(c.assets).find(([, id]) => id.toString() === req.asset)![0];
    const data = {
      network: c.caip2, tx_id: v.txId, source: meta.source, business_id: meta.businessId, resource_id: meta.resourceId ?? null,
      api_key_id: meta.apiKeyId ?? null, payer: v.payer!, pay_to: req.payTo, asset, asset_id: BigInt(req.asset),
      amount_units: BigInt(req.amount), fee_sponsored: !!v.sponsored, status: 'settling', error: null,
    };
    // Claim the txId first: a second settle of the same payment can never broadcast twice.
    const prev = await this.prisma.x402_payments.findUnique({ where: { network_tx_id: { network: c.caip2, tx_id: v.txId } } });
    let row: { id: string };
    try {
      if (prev) {
        const claim = await this.prisma.x402_payments.updateMany({ where: { id: prev.id, status: 'failed' }, data });
        if (!claim.count) throw new Error('used');
        row = prev;
      } else row = await this.prisma.x402_payments.create({ data });
    } catch {
      return { success: false, errorReason: 'invalid_transaction_state', errorMessage: 'This payment was already used', transaction: '', ...base };
    }
    try {
      const confirmed = await this.chain.send(v.group, v.txId);
      await this.prisma.x402_payments.update({ where: { id: row.id }, data: { status: 'settled', confirmed_round: confirmed, settled_at: new Date() } });
      this.webhooks.emit(meta.businessId, 'live', 'x402.payment.settled', {
          id: row.id, transaction: v.txId, network: c.caip2, payer: v.payer, asset, amount: fromUnits(BigInt(req.amount), asset),
          resource_id: meta.resourceId ?? null, source: meta.source,
        });
      return { success: true, transaction: v.txId, amount: req.amount, ...base };
    } catch (e: any) {
      const msg = String(e?.message ?? 'Settlement failed').slice(0, 300);
      // A broadcast that timed out may still confirm: keep it 'pending' so it is never re-used.
      const pending = /timeout|waiting|rounds/i.test(msg);
      await this.prisma.x402_payments.update({ where: { id: row.id }, data: { status: pending ? 'pending' : 'failed', error: msg } });
      this.log.warn(`x402 settle ${pending ? 'pending' : 'failed'} tx=${v.txId}`);
      return { success: false, errorReason: pending ? 'settlement_pending' : 'invalid_transaction_state', errorMessage: msg, transaction: v.txId, ...base };
    }
  }

  // ---------- business resources ----------
  /** The owner's FARM custodial address on this network (payments land there). */
  async payToFor(ownerUserId: string): Promise<string> {
    const c = this.ensure();
    const w = await this.prisma.user_chain_wallets.findUnique({ where: { user_id: ownerUserId } });
    if (!w || w.network !== c.network) throw new BadRequestException('The business owner has no FARM on-chain account on this network yet');
    return w.address;
  }

  private view(r: any) {
    return {
      id: r.id, object: 'x402_resource', name: r.name, description: r.description, method: r.method, upstream_url: r.upstream_url,
      mime_type: r.mime_type, asset: r.asset, price: fromUnits(BigInt(r.price_units), r.asset), pay_to: r.pay_to, status: r.status,
      gateway_path: `/v1/x402/r/${r.id}`, created_at: r.created_at, updated_at: r.updated_at,
    };
  }
  private price(asset: string, price: number | string): bigint {
    const c = this.cfg();
    if (!['FARM', 'USDC'].includes(asset) || c.assets[asset as 'FARM' | 'USDC'] === undefined) throw new BadRequestException(`${asset} is not available`);
    let units: bigint;
    try {
      units = toUnits(price, asset);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    if (units <= 0n) throw new BadRequestException('Price must be above 0');
    if (Number(price) > c.maxPrice[asset as 'FARM' | 'USDC']) throw new BadRequestException(`Price is above the ${asset} limit`);
    return units;
  }
  private async upstream(url: string) {
    try {
      return (await assertSafeUrl(url)).toString();
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  async createResource(userId: string, dto: { name: string; description?: string; method?: string; upstream_url: string; mime_type?: string; asset: string; price: number | string }) {
    const c = this.ensure();
    const a = await this.access.resolve(userId, 'links:manage');
    if (a.business.status !== 'approved') throw new ForbiddenException('Your business must be verified first');
    const method = (dto.method ?? 'GET').toUpperCase();
    if (!METHODS.includes(method)) throw new BadRequestException('Method must be GET, POST or ANY');
    const price_units = this.price(dto.asset, dto.price);
    const upstream_url = await this.upstream(dto.upstream_url);
    const pay_to = await this.payToFor(a.business.owner_user_id);
    if (!(await this.chain.optedIn(pay_to, c.assets[dto.asset as 'FARM' | 'USDC']!)))
      throw new BadRequestException(`The business account is not opted in to ${dto.asset} yet`);
    const id = randomUUID();
    const secret = randomBytes(32);
    const sealed = sealSecret(secret, `x402:${id}`);
    const r = await this.prisma.x402_resources.create({
      data: { id, business_id: a.business.id, created_by: userId, name: dto.name.trim(), description: dto.description?.trim() || null, method, upstream_url, mime_type: dto.mime_type || null, asset: dto.asset, price_units, pay_to, status: 'active', ...sealed },
    });
    // The signing secret is shown ONCE so the business can verify FARM's upstream calls.
    return { ...this.view(r), signing_secret: `x402sec_${secret.toString('base64url')}` };
  }
  async listResources(userId: string) {
    const a = await this.access.resolve(userId, 'links:read');
    const rows = await this.prisma.x402_resources.findMany({ where: { business_id: a.business.id }, orderBy: { created_at: 'desc' } });
    return rows.map((r) => this.view(r));
  }
  private async own(userId: string, id: string, perm: 'links:read' | 'links:manage') {
    const a = await this.access.resolve(userId, perm);
    const r = await this.prisma.x402_resources.findUnique({ where: { id } });
    if (!r || r.business_id !== a.business.id) throw new NotFoundException('Resource not found');
    return r;
  }
  async getResource(userId: string, id: string) {
    return this.view(await this.own(userId, id, 'links:read'));
  }
  async updateResource(userId: string, id: string, dto: { name?: string; description?: string; status?: string; price?: number | string; upstream_url?: string }) {
    const r = await this.own(userId, id, 'links:manage');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.status !== undefined) {
      if (!['active', 'paused'].includes(dto.status)) throw new BadRequestException('Status must be active or paused');
      data.status = dto.status;
    }
    if (dto.price !== undefined) data.price_units = this.price(r.asset, dto.price);
    if (dto.upstream_url !== undefined) data.upstream_url = await this.upstream(dto.upstream_url);
    return this.view(await this.prisma.x402_resources.update({ where: { id }, data }));
  }
  async payments(userId: string, resourceId?: string) {
    const a = await this.access.resolve(userId, 'links:read');
    const rows = await this.prisma.x402_payments.findMany({
      where: { business_id: a.business.id, ...(resourceId ? { resource_id: resourceId } : {}) },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((p) => ({
      id: p.id, transaction: p.tx_id, network: p.network, source: p.source, resource_id: p.resource_id, payer: p.payer,
      asset: p.asset, amount: fromUnits(p.amount_units, p.asset), status: p.status, error: p.error, upstream_status: p.upstream_status,
      fee_sponsored: p.fee_sponsored, created_at: p.created_at, settled_at: p.settled_at,
    }));
  }

  // ---------- gateway (resource server) ----------
  /**
   * x402 "authorization" flow: verify -> call the business's service -> settle.
   * The payer is charged only when the service answers 2xx/3xx.
   */
  async gateway(id: string, req: { method: string; url: string; query: string; headers: Record<string, any>; body?: unknown }) {
    const c = this.ensure();
    const r = await this.prisma.x402_resources.findUnique({ where: { id } });
    if (!r || r.status !== 'active') throw new NotFoundException('Resource not found');
    if (r.method !== 'ANY' && r.method !== req.method) throw new BadRequestException(`Use ${r.method}`);
    const requirements = this.requirementsFor(r);
    const required = (error: string) => {
      const body = {
        x402Version: 2, error,
        resource: { url: req.url, description: r.description ?? r.name, mimeType: r.mime_type ?? 'application/json', serviceName: 'FARM x402' },
        accepts: [requirements], extensions: {},
      };
      return { status: 402, headers: { 'PAYMENT-REQUIRED': b64json(body) }, json: body };
    };
    const raw = req.headers['payment-signature'];
    if (!raw) return required('PAYMENT-SIGNATURE header is required');
    let payload: PaymentPayload;
    try {
      if (typeof raw !== 'string' || raw.length > 150_000) throw new Error();
      payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return required('invalid_payload');
    }
    const v = await this.verify(payload, requirements, r.pay_to);
    if (!v.isValid) return required(v.invalidReason ?? 'invalid_payload');

    const secret = Buffer.from(openSecret(r, `x402:${r.id}`));
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', secret).update(`${ts}.${r.id}.${v.txId}.${v.payer}`).digest('hex');
    secret.fill(0);
    const hasBody = req.method !== 'GET' && req.body !== undefined && req.body !== null && Object.keys(req.body as object).length > 0;
    let up;
    try {
      up = await safeFetch(r.upstream_url + (req.query ? (r.upstream_url.includes('?') ? '&' : '?') + req.query : ''), {
        method: req.method,
        headers: {
          accept: String(req.headers['accept'] ?? '*/*'),
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
          'x-farm-x402-timestamp': ts, 'x-farm-x402-resource': r.id, 'x-farm-x402-transaction': v.txId!,
          'x-farm-x402-payer': v.payer!, 'x-farm-x402-signature': sig,
        },
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
    } catch (e: any) {
      return { status: 502, headers: {}, json: { error: 'The service did not respond. You were not charged.' } };
    }
    if (up.status >= 400)
      return { status: up.status, headers: {}, raw: up.body, contentType: up.contentType, note: 'not_charged' };

    const s = await this.settle(payload, requirements, { source: 'gateway', businessId: r.business_id, resourceId: r.id }, r.pay_to, v);
    if (s.transaction) await this.prisma.x402_payments.updateMany({ where: { network: c.caip2, tx_id: s.transaction }, data: { upstream_status: up.status } });
    if (!s.success) return required((s as { errorReason?: string }).errorReason ?? 'settlement_failed');
    return { status: up.status, headers: { 'PAYMENT-RESPONSE': b64json(s) }, raw: up.body, contentType: up.contentType };
  }
}

/** Group ids are computed over transactions without their `grp` field. */
function withoutGroup(t: algosdk.Transaction): algosdk.Transaction {
  const m = algosdk.decodeObj(algosdk.encodeUnsignedTransaction(t)) as Record<string, unknown>;
  delete m.grp;
  return algosdk.decodeUnsignedTransaction(algosdk.encodeObj(m));
}
