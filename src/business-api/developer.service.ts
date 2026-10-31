import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import {
  BusinessWebhooksService,
  WEBHOOK_EVENTS,
  assertSafeWebhookUrl,
  encryptSecret,
  newWebhookSecret,
} from '../business-ops/business-webhooks.service';
import { paginate, paginationParams } from '../common/utils/pagination.util';
import { API_SCOPES, DEFAULT_SCOPES, SCOPE_REQUIRES } from './api-scopes';
import { can } from '../business-ops/permissions';
import { UpdateWebhookDto, WebhookEndpointDto } from './business-api.dto';

const MAX_ENDPOINTS = 10;
const USAGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };

function endpointView(e: any) {
  const { secret_encrypted: _s, ...rest } = e;
  return rest;
}

/** Dashboard side of the developer API: webhooks, logs, usage, overview. */
@Injectable()
export class DeveloperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly auth: AuthService,
    private readonly webhooks: BusinessWebhooksService,
  ) {}

  async meta(userId: string) {
    const a = await this.access.resolve(userId, 'developers:read');
    return {
      data: {
        scopes: API_SCOPES.map((s) => ({
          scope: s,
          grantable: can(a.role, SCOPE_REQUIRES[s]),
          default: DEFAULT_SCOPES.includes(s),
        })),
        webhook_events: WEBHOOK_EVENTS,
        role: a.role,
        can_manage: can(a.role, 'developers:manage'),
        docs_path: '/api/developer/docs',
        openapi_path: '/api/developer/openapi.json',
      },
    };
  }

  async overview(userId: string, mode: string) {
    const a = await this.access.resolve(userId, 'developers:read');
    const m = mode === 'live' ? 'live' : 'sandbox';
    const since = new Date(Date.now() - 86400_000);
    const bid = a.business.id;
    const [keys, endpoints, req24, err24, failedDeliveries] = await Promise.all(
      [
        this.prisma.api_keys.count({
          where: { business_id: bid, mode: m, status: 'active' },
        }),
        this.prisma.business_webhook_endpoints.count({
          where: { business_id: bid, mode: m, is_active: true },
        }),
        this.prisma.business_api_requests.count({
          where: { business_id: bid, mode: m, created_at: { gte: since } },
        }),
        this.prisma.business_api_requests.count({
          where: {
            business_id: bid,
            mode: m,
            created_at: { gte: since },
            status_code: { gte: 400 },
          },
        }),
        this.prisma.business_webhook_deliveries.count({
          where: { status: 'failed', endpoint: { business_id: bid, mode: m } },
        }),
      ],
    );
    return {
      data: {
        mode: m,
        active_keys: keys,
        active_webhooks: endpoints,
        requests_24h: req24,
        errors_24h: err24,
        failed_deliveries: failedDeliveries,
      },
    };
  }

  // ---------- webhooks ----------
  async listEndpoints(userId: string, mode?: string) {
    const a = await this.access.resolve(userId, 'developers:read');
    const items = await this.prisma.business_webhook_endpoints.findMany({
      where: {
        business_id: a.business.id,
        ...(mode === 'live' || mode === 'sandbox' ? { mode } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return { data: items.map(endpointView) };
  }

  async createEndpoint(userId: string, dto: WebhookEndpointDto) {
    const a = await this.access.resolve(userId, 'developers:manage');
    try {
      await assertSafeWebhookUrl(dto.url);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    const n = await this.prisma.business_webhook_endpoints.count({
      where: { business_id: a.business.id, mode: dto.mode },
    });
    if (n >= MAX_ENDPOINTS)
      throw new BadRequestException(
        `At most ${MAX_ENDPOINTS} ${dto.mode} endpoints`,
      );
    const secret = newWebhookSecret();
    const e = await this.prisma.business_webhook_endpoints.create({
      data: {
        business_id: a.business.id,
        mode: dto.mode,
        url: dto.url,
        description: dto.description,
        events: [...new Set(dto.events)],
        secret_encrypted: encryptSecret(secret),
        created_by: userId,
      },
    });
    return {
      data: { ...endpointView(e), signing_secret: secret },
      message: 'Copy the signing secret now. It will not be shown again.',
    };
  }

  async updateEndpoint(userId: string, id: string, dto: UpdateWebhookDto) {
    const a = await this.access.resolve(userId, 'developers:manage');
    await this.endpoint(a.business.id, id);
    const e = await this.prisma.business_webhook_endpoints.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.events ? { events: [...new Set(dto.events)] } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      },
    });
    return { data: endpointView(e) };
  }

  async rollSecret(userId: string, id: string, pin: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    await this.auth.verifyPin(userId, pin);
    await this.endpoint(a.business.id, id);
    const secret = newWebhookSecret();
    await this.prisma.business_webhook_endpoints.update({
      where: { id },
      data: { secret_encrypted: encryptSecret(secret) },
    });
    return {
      data: { id, signing_secret: secret },
      message: 'Signing secret replaced',
    };
  }

  async deleteEndpoint(userId: string, id: string, pin: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    await this.auth.verifyPin(userId, pin);
    await this.endpoint(a.business.id, id);
    await this.prisma.business_webhook_endpoints.delete({ where: { id } });
    return { data: { id }, message: 'Webhook endpoint deleted' };
  }

  async testEndpoint(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    const e = await this.endpoint(a.business.id, id);
    const ids = await this.webhooks.enqueue(
      a.business.id,
      e.mode as any,
      'webhook.test',
      { message: 'Test event from FARM' },
      e.id,
    );
    return { data: { delivery_ids: ids }, message: 'Test event queued' };
  }

  async deliveries(userId: string, id: string, q: any) {
    const a = await this.access.resolve(userId, 'developers:read');
    await this.endpoint(a.business.id, id);
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = { endpoint_id: id };
    if (q.status) where.status = String(q.status);
    const [items, total] = await Promise.all([
      this.prisma.business_webhook_deliveries.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.business_webhook_deliveries.count({ where }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async retryDelivery(userId: string, deliveryId: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    const d = await this.prisma.business_webhook_deliveries.findFirst({
      where: { id: deliveryId, endpoint: { business_id: a.business.id } },
    });
    if (!d) throw new NotFoundException('Delivery not found');
    if (d.status === 'succeeded')
      throw new BadRequestException('Delivery already succeeded');
    return { data: await this.webhooks.retryNow(d.id) };
  }

  // ---------- logs & usage ----------
  async requests(userId: string, q: any) {
    const a = await this.access.resolve(userId, 'developers:read');
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = { business_id: a.business.id };
    if (q.mode === 'live' || q.mode === 'sandbox') where.mode = q.mode;
    if (q.api_key_id) where.api_key_id = String(q.api_key_id);
    if (q.errors === 'true') where.status_code = { gte: 400 };
    const [items, total] = await Promise.all([
      this.prisma.business_api_requests.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: { api_key: { select: { name: true, key_prefix: true } } },
      }),
      this.prisma.business_api_requests.count({ where }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async usage(userId: string, range: string, mode: string) {
    const days = USAGE_DAYS[range];
    if (!days)
      throw new BadRequestException('range must be one of 24h, 7d, 30d');
    const a = await this.access.resolve(userId, 'developers:read');
    const m = mode === 'live' ? 'live' : 'sandbox';
    const since = new Date(Date.now() - days * 86400_000);
    const bucket = days === 1 ? 'hour' : 'day';
    const series = await this.prisma.$queryRaw<
      { bucket: Date; total: bigint; errors: bigint; avg_ms: number | null }[]
    >(Prisma.sql`
      SELECT date_trunc(${bucket}, created_at) AS bucket,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status_code >= 400) AS errors,
             AVG(duration_ms)::float AS avg_ms
      FROM business_api_requests
      WHERE business_id = ${a.business.id}::uuid AND mode = ${m} AND created_at >= ${since}
      GROUP BY 1 ORDER BY 1`);
    const byKey = await this.prisma.business_api_requests.groupBy({
      by: ['api_key_id'],
      where: {
        business_id: a.business.id,
        mode: m,
        created_at: { gte: since },
      },
      _count: { _all: true },
    });
    const keys = await this.prisma.api_keys.findMany({
      where: {
        id: { in: byKey.map((k) => k.api_key_id).filter(Boolean) as string[] },
      },
      select: { id: true, name: true, key_prefix: true },
    });
    const total = series.reduce((s, r) => s + Number(r.total), 0);
    const errors = series.reduce((s, r) => s + Number(r.errors), 0);
    return {
      data: {
        range,
        mode: m,
        bucket,
        total,
        errors,
        error_rate: total ? Math.round((errors / total) * 1000) / 10 : 0,
        series: series.map((r) => ({
          bucket: r.bucket,
          total: Number(r.total),
          errors: Number(r.errors),
          avg_ms: r.avg_ms == null ? null : Math.round(r.avg_ms),
        })),
        by_key: byKey.map((k) => ({
          api_key_id: k.api_key_id,
          name: keys.find((x) => x.id === k.api_key_id)?.name ?? null,
          prefix: keys.find((x) => x.id === k.api_key_id)?.key_prefix ?? null,
          requests: k._count._all,
        })),
      },
    };
  }

  private async endpoint(businessId: string, id: string) {
    const e = await this.prisma.business_webhook_endpoints.findFirst({
      where: { id, business_id: businessId },
    });
    if (!e) throw new NotFoundException('Webhook endpoint not found');
    return e;
  }
}
