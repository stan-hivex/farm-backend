import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { ApiScope, modeOfKey } from './api-scopes';
import { hashKey } from './api-keys.service';

export const API_SCOPE_KEY = 'farmApiScope';
export const RequireScope = (scope: ApiScope) =>
  SetMetadata(API_SCOPE_KEY, scope);

export interface FarmApiContext {
  keyId: string;
  businessId: string;
  ownerUserId: string;
  mode: 'sandbox' | 'live';
  scopes: string[];
}

export function extractKey(req: any): string | null {
  const h = String(req.headers?.authorization ?? '');
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  const x = req.headers?.['x-api-key'];
  return x ? String(x).trim() : null;
}

/**
 * Authenticates business API keys (hash lookup), enforces per-key scopes and
 * writes one request-log row per call.
 */
@Injectable()
export class BusinessApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const raw = extractKey(req);
    if (!raw || !modeOfKey(raw))
      throw new UnauthorizedException('A valid FARM API key is required');
    const key = await this.prisma.api_keys.findUnique({
      where: { api_key_hash: hashKey(raw) },
      include: {
        business: { select: { id: true, status: true, owner_user_id: true } },
      },
    });
    const mode = modeOfKey(raw)!;
    if (
      !key ||
      !key.business ||
      key.status !== 'active' ||
      key.mode !== mode ||
      (key.expires_at && key.expires_at <= new Date())
    )
      throw new UnauthorizedException('Invalid, revoked or expired API key');
    if (key.business.status !== 'approved')
      throw new ForbiddenException('Business account is not approved');

    const scopes = Array.isArray(key.permissions)
      ? (key.permissions as string[])
      : [];
    const api: FarmApiContext = {
      keyId: key.id,
      businessId: key.business.id,
      ownerUserId: key.business.owner_user_id,
      mode,
      scopes,
    };
    req.farmApi = api;

    const started = Date.now();
    res.on?.('finish', () => {
      this.prisma.business_api_requests
        .create({
          data: {
            business_id: api.businessId,
            api_key_id: api.keyId,
            mode,
            method: String(req.method).slice(0, 10),
            path: String(req.originalUrl ?? req.url)
              .split('?')[0]
              .slice(0, 500),
            status_code: res.statusCode,
            duration_ms: Date.now() - started,
            ip_address: String(req.ip ?? '').slice(0, 100) || null,
          },
        })
        .catch(() => undefined);
    });
    if (!key.last_used_at || Date.now() - key.last_used_at.getTime() > 60_000)
      this.prisma.api_keys
        .update({ where: { id: key.id }, data: { last_used_at: new Date() } })
        .catch(() => undefined);

    const need = this.reflector.getAllAndOverride<ApiScope | undefined>(
      API_SCOPE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (need && !scopes.includes(need))
      throw new ForbiddenException(`This API key is missing the ${need} scope`);
    return true;
  }
}
