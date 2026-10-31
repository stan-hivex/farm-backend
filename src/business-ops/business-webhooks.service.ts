import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHmac, randomBytes } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { PrismaService } from '../database/prisma.service';
import { fieldEncryption } from '../common/encryption/field-encryption';

export type ApiMode = 'sandbox' | 'live';

/** Events a business can subscribe to. Only events we actually emit are listed. */
export const WEBHOOK_EVENTS = [
  'payment.succeeded',
  'payment_link.paid',
  'invoice.paid',
  'escrow.funded',
  'payout.requested',
  'webhook.test',
] as const;

/** Delay before each retry (attempt 2..6). After the last one the delivery is marked failed. */
export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3600_000,
  6 * 3600_000,
];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function signPayload(secret: string, timestamp: number, body: string) {
  const sig = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export function encryptSecret(secret: string) {
  if (!fieldEncryption)
    throw new Error('Field encryption is not configured on this server');
  return fieldEncryption.encrypt(secret);
}

export function decryptSecret(value: string) {
  if (!fieldEncryption)
    throw new Error('Field encryption is not configured on this server');
  return fieldEncryption.decrypt(value);
}

export function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

function privateAddress(ip: string) {
  if (
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fe80') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  )
    return true;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const p = v4.split('.').map(Number);
  if (p.length !== 4) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  );
}

/** Only public https URLs may receive webhooks (blocks SSRF into internal hosts). */
export async function assertSafeWebhookUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Webhook URL is not valid');
  }
  if (u.protocol !== 'https:') throw new Error('Webhook URL must use https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
    throw new Error('Webhook URL must be a public host');
  const ips = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!ips.length) throw new Error('Webhook host could not be resolved');
  if (ips.some(privateAddress))
    throw new Error('Webhook URL must be a public host');
}

/**
 * Signed webhook deliveries with retries and a delivery log.
 * Sandbox events only go to sandbox endpoints and live events to live endpoints.
 */
@Injectable()
export class BusinessWebhooksService {
  private readonly logger = new Logger(BusinessWebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: never lets webhook problems break the caller's flow. */
  emit(businessId: string, mode: ApiMode, type: string, data: unknown) {
    this.enqueue(businessId, mode, type, data).catch((e) =>
      this.logger.warn(`webhook enqueue failed: ${e?.message}`),
    );
  }

  async enqueue(
    businessId: string,
    mode: ApiMode,
    type: string,
    data: unknown,
    onlyEndpointId?: string,
  ) {
    const endpoints = await this.prisma.business_webhook_endpoints.findMany({
      where: {
        business_id: businessId,
        mode,
        is_active: true,
        ...(onlyEndpointId ? { id: onlyEndpointId } : {}),
      },
    });
    const targets = endpoints.filter((e) => {
      if (onlyEndpointId) return true;
      const ev = Array.isArray(e.events) ? (e.events as string[]) : [];
      return ev.includes('*') || ev.includes(type);
    });
    const created: string[] = [];
    for (const ep of targets) {
      const eventId = `evt_${randomBytes(12).toString('hex')}`;
      const payload = {
        id: eventId,
        type,
        livemode: mode === 'live',
        created: new Date().toISOString(),
        data,
      };
      const d = await this.prisma.business_webhook_deliveries.create({
        data: {
          endpoint_id: ep.id,
          event_id: eventId,
          event_type: type,
          payload: payload as any,
          status: 'pending',
          next_attempt_at: new Date(),
        },
      });
      created.push(d.id);
      void this.attempt(d.id);
    }
    return created;
  }

  async attempt(deliveryId: string) {
    const d = await this.prisma.business_webhook_deliveries.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!d || d.status === 'succeeded' || d.status === 'failed') return d;
    const attempts = d.attempts + 1;
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000);
    let status = 0;
    let text = '';
    let error: string | null = null;
    try {
      if (!d.endpoint.is_active) throw new Error('Endpoint is disabled');
      await assertSafeWebhookUrl(d.endpoint.url);
      const secret = decryptSecret(d.endpoint.secret_encrypted);
      const res = await fetch(d.endpoint.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'FARM-Webhooks/1.0',
          'farm-event-id': d.event_id,
          'farm-event-type': d.event_type,
          'farm-signature': signPayload(secret, ts, body),
        },
        body,
      });
      status = res.status;
      text = (await res.text().catch(() => '')).slice(0, 1000);
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 500);
    }
    const ok = !error;
    const finalFail = !ok && attempts >= MAX_ATTEMPTS;
    return this.prisma.business_webhook_deliveries.update({
      where: { id: d.id },
      data: {
        attempts,
        response_status: status || null,
        response_body: text || null,
        error,
        status: ok ? 'succeeded' : finalFail ? 'failed' : 'retrying',
        delivered_at: ok ? new Date() : null,
        next_attempt_at:
          ok || finalFail
            ? null
            : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
      },
    });
  }

  @Cron('* * * * *')
  async retryDue() {
    const due = await this.prisma.business_webhook_deliveries
      .findMany({
        where: {
          status: { in: ['pending', 'retrying'] },
          next_attempt_at: { lte: new Date() },
        },
        select: { id: true },
        take: 50,
        orderBy: { next_attempt_at: 'asc' },
      })
      .catch(() => []);
    for (const d of due) await this.attempt(d.id).catch(() => undefined);
  }

  /** Manual retry from the dashboard: one more attempt even after final failure. */
  async retryNow(deliveryId: string) {
    await this.prisma.business_webhook_deliveries.update({
      where: { id: deliveryId },
      data: { status: 'retrying', next_attempt_at: new Date() },
    });
    return this.attempt(deliveryId);
  }
}
