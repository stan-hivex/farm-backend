import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { can } from '../business-ops/permissions';
import {
  API_SCOPES,
  ApiScope,
  DEFAULT_SCOPES,
  KEY_PREFIX,
  SCOPE_REQUIRES,
} from './api-scopes';
import { CreateApiKeyDto } from './business-api.dto';

export const MAX_ACTIVE_KEYS_PER_MODE = 10;

export function hashKey(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateKey(mode: 'sandbox' | 'live') {
  const raw = `${KEY_PREFIX[mode]}${randomBytes(24).toString('hex')}`;
  return {
    raw,
    hash: hashKey(raw),
    prefix: raw.slice(0, KEY_PREFIX[mode].length + 6),
  };
}

function present(k: any) {
  return {
    id: k.id,
    name: k.name,
    mode: k.mode,
    prefix: k.key_prefix,
    status: k.status,
    scopes: Array.isArray(k.permissions) ? k.permissions : [],
    last_used_at: k.last_used_at,
    expires_at: k.expires_at,
    revoked_at: k.revoked_at,
    rotated_from_id: k.rotated_from_id,
    created_at: k.created_at,
  };
}

/** Key management for business owners, admins and developers. Secrets are shown once. */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly auth: AuthService,
  ) {}

  async list(userId: string, mode?: string) {
    const a = await this.access.resolve(userId, 'developers:read');
    const keys = await this.prisma.api_keys.findMany({
      where: {
        business_id: a.business.id,
        ...(mode === 'sandbox' || mode === 'live' ? { mode } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return { data: keys.map(present) };
  }

  /** "Reveal" only ever returns the non-secret prefix; the full key is unrecoverable. */
  async reveal(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'developers:read');
    const k = await this.find(a.business.id, id);
    return { data: { id: k.id, prefix: k.key_prefix, mode: k.mode } };
  }

  checkScopes(role: any, scopes?: string[]): ApiScope[] {
    const list = scopes?.length ? scopes : DEFAULT_SCOPES;
    for (const s of list) {
      if (!(API_SCOPES as readonly string[]).includes(s))
        throw new BadRequestException(`Unknown scope: ${s}`);
      if (!can(role, SCOPE_REQUIRES[s as ApiScope]))
        throw new ForbiddenException(
          `Your business role cannot grant the ${s} scope`,
        );
    }
    return [...new Set(list)] as ApiScope[];
  }

  async create(userId: string, dto: CreateApiKeyDto) {
    const a = await this.access.resolve(userId, 'developers:manage');
    const scopes = this.checkScopes(a.role, dto.scopes);
    const expires_at = dto.expires_at ? new Date(dto.expires_at) : null;
    if (expires_at && expires_at <= new Date())
      throw new BadRequestException('Expiry must be in the future');
    const active = await this.prisma.api_keys.count({
      where: { business_id: a.business.id, mode: dto.mode, status: 'active' },
    });
    if (active >= MAX_ACTIVE_KEYS_PER_MODE)
      throw new BadRequestException(
        `You can have at most ${MAX_ACTIVE_KEYS_PER_MODE} active ${dto.mode} keys`,
      );
    const g = generateKey(dto.mode);
    const k = await this.prisma.api_keys.create({
      data: {
        user_id: userId,
        business_id: a.business.id,
        name: dto.name.trim(),
        mode: dto.mode,
        key_prefix: g.prefix,
        api_key: g.prefix,
        api_key_hash: g.hash,
        permissions: scopes,
        status: 'active',
        expires_at,
      },
    });
    await this.audit(userId, 'business.api_key_created', a.business.id, k.id);
    return {
      data: { ...present(k), secret: g.raw },
      message: 'Copy this key now. It will not be shown again.',
    };
  }

  async rotate(userId: string, id: string, pin: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    await this.auth.verifyPin(userId, pin);
    const old = await this.find(a.business.id, id);
    if (old.status !== 'active')
      throw new BadRequestException('Only active keys can be rotated');
    const scopes = this.checkScopes(
      a.role,
      Array.isArray(old.permissions) ? (old.permissions as string[]) : [],
    );
    const mode = old.mode === 'live' ? 'live' : 'sandbox';
    const g = generateKey(mode);
    const [, k] = await this.prisma.$transaction([
      this.prisma.api_keys.update({
        where: { id: old.id },
        data: { status: 'revoked', revoked_at: new Date() },
      }),
      this.prisma.api_keys.create({
        data: {
          user_id: userId,
          business_id: a.business.id,
          name: old.name,
          mode,
          key_prefix: g.prefix,
          api_key: g.prefix,
          api_key_hash: g.hash,
          permissions: scopes,
          status: 'active',
          expires_at: old.expires_at,
          rotated_from_id: old.id,
        },
      }),
    ]);
    await this.audit(userId, 'business.api_key_rotated', a.business.id, k.id);
    return {
      data: { ...present(k), secret: g.raw },
      message: 'Key rotated. The old key stopped working immediately.',
    };
  }

  async revoke(userId: string, id: string, pin: string) {
    const a = await this.access.resolve(userId, 'developers:manage');
    await this.auth.verifyPin(userId, pin);
    const k = await this.find(a.business.id, id);
    if (k.status !== 'active')
      throw new BadRequestException('Key is already revoked');
    await this.prisma.api_keys.update({
      where: { id: k.id },
      data: { status: 'revoked', revoked_at: new Date() },
    });
    await this.audit(userId, 'business.api_key_revoked', a.business.id, k.id);
    return { data: { id: k.id, status: 'revoked' }, message: 'Key revoked' };
  }

  private async find(businessId: string, id: string) {
    const k = await this.prisma.api_keys.findFirst({
      where: { id, business_id: businessId },
    });
    if (!k) throw new NotFoundException('API key not found');
    return k;
  }

  private async audit(
    userId: string,
    action: string,
    bid: string,
    keyId: string,
  ) {
    await this.prisma.audit_logs
      .create({
        data: {
          user_id: userId,
          action,
          entity_type: 'business',
          entity_id: bid,
          new_values: { api_key_id: keyId },
        } as any,
      })
      .catch(() => undefined);
  }
}
