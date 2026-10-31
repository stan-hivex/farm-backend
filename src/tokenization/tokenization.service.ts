import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { AlgorandAsaClient } from './algorand-asa.client';
import { algorandConfig, explorerAsset, explorerTx } from './algorand-config';

/** 1 token unit represents 1 FARM of principal invested (whole units only). */
export const UNIT_PRICE = 1;
const TOKENIZABLE = ['funded', 'closed'];
const HOLDING = ['committed', 'active'];

const shape = (t: any) =>
  t && {
    ...t,
    unit_price: Number(t.unit_price),
    total_units: t.total_units?.toString(),
    asset_id: t.asset_id?.toString() ?? null,
    confirmed_round: t.confirmed_round?.toString() ?? null,
    explorer_url: t.asset_id ? explorerAsset(t.network, t.asset_id) : null,
    tx_url: t.create_tx_id ? explorerTx(t.network, t.create_tx_id) : null,
  };

@Injectable()
export class TokenizationService {
  private readonly log = new Logger(TokenizationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly chain: AlgorandAsaClient,
  ) {}

  status() {
    const c = algorandConfig();
    return {
      data: {
        enabled: c.enabled,
        network: c.network,
        missing: c.missing,
        problems: c.problems,
      },
    };
  }

  // ---------- Business ----------
  async businessGet(userId: string, projectId: string) {
    const actor = await this.access.resolve(userId, 'projects:read');
    const p = await this.prisma.investment_projects.findFirst({
      where: { id: projectId, business_id: actor.business.id },
      include: { token: true },
    });
    if (!p) throw new NotFoundException('Project not found');
    return { data: shape(p.token) ?? null, enabled: algorandConfig().enabled };
  }

  async request(
    userId: string,
    projectId: string,
    dto: { asset_name: string; unit_name: string },
  ) {
    const actor = await this.access.resolve(userId, 'projects:manage');
    const p = await this.prisma.investment_projects.findFirst({
      where: { id: projectId, business_id: actor.business.id },
      include: { token: true },
    });
    if (!p) throw new NotFoundException('Project not found');
    if (!TOKENIZABLE.includes(p.status ?? ''))
      throw new BadRequestException(
        'Only funded or closed projects can be tokenized',
      );
    if (!(Number(p.raised_amount ?? 0) >= UNIT_PRICE))
      throw new BadRequestException('Nothing was raised for this project');
    if (p.token && p.token.status !== 'rejected')
      throw new BadRequestException('Tokenization was already requested');
    const name = dto.asset_name?.trim();
    const unit = dto.unit_name?.trim().toUpperCase();
    if (!name || Buffer.byteLength(name) > 32)
      throw new BadRequestException('asset_name must be 1-32 bytes');
    if (!unit || !/^[A-Z0-9]{1,8}$/.test(unit))
      throw new BadRequestException('unit_name must be 1-8 letters or digits');
    const data = {
      status: 'requested',
      network: algorandConfig().network,
      asset_name: name,
      unit_name: unit,
      unit_price: UNIT_PRICE,
      total_units: BigInt(0),
      requested_by: userId,
      notes: null,
      error: null,
    };
    const t = p.token
      ? await this.prisma.project_tokens.update({
          where: { id: p.token.id },
          data,
        })
      : await this.prisma.project_tokens.create({
          data: { ...data, project_id: projectId },
        });
    return { data: shape(t) };
  }

  // ---------- Admin ----------
  async adminList(status?: string) {
    const rows = await this.prisma.project_tokens.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        project: {
          select: { project_name: true, status: true, raised_amount: true },
        },
      },
    });
    return { data: rows.map(shape), config: this.status().data };
  }

  async reject(adminId: string, tokenId: string, notes: string) {
    if (!notes?.trim()) throw new BadRequestException('Notes are required');
    const r = await this.prisma.project_tokens.updateMany({
      where: { id: tokenId, status: { in: ['requested', 'failed'] } },
      data: { status: 'rejected', notes: notes.trim(), reviewed_by: adminId },
    });
    if (!r.count) throw new BadRequestException('Request is not pending');
    return { data: { id: tokenId, status: 'rejected' } };
  }

  /**
   * Approve and create the ASA on Algorand TestNet. Allocations mirror the
   * investments held at that moment (FARM custody). Only a confirmed algod
   * response is stored - nothing is written on failure except the error.
   */
  async approveAndMint(adminId: string, tokenId: string) {
    const cfg = algorandConfig();
    if (!cfg.enabled)
      throw new ServiceUnavailableException({
        message:
          'Tokenization is disabled until Algorand TestNet is configured',
        missing: cfg.missing,
        problems: cfg.problems,
      });
    const claim = await this.prisma.project_tokens.updateMany({
      where: { id: tokenId, status: { in: ['requested', 'failed'] } },
      data: { status: 'creating', reviewed_by: adminId, error: null },
    });
    if (!claim.count) throw new BadRequestException('Request is not pending');
    const t = await this.prisma.project_tokens.findUnique({
      where: { id: tokenId },
      include: { project: true },
    });
    if (!t) throw new NotFoundException('Token request not found');
    try {
      if (!TOKENIZABLE.includes(t.project.status ?? ''))
        throw new BadRequestException('Project is no longer funded/closed');
      const invs = await this.prisma.user_investments.findMany({
        where: { project_id: t.project_id, status: { in: HOLDING } },
        select: { id: true, user_id: true, amount: true },
      });
      const allocs = invs
        .map((i) => ({
          investment_id: i.id,
          user_id: i.user_id!,
          units: BigInt(Math.floor(Number(i.amount ?? 0) / UNIT_PRICE)),
        }))
        .filter((a) => a.user_id && a.units > 0n);
      const total = allocs.reduce((s, a) => s + a.units, 0n);
      if (total <= 0n)
        throw new BadRequestException('No investments to tokenize');

      const res = await this.chain.createAsset({
        assetName: t.asset_name,
        unitName: t.unit_name,
        total,
        note: `farm:project:${t.project_id}`,
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.project_tokens.update({
          where: { id: tokenId },
          data: {
            status: 'created',
            total_units: total,
            asset_id: res.assetId,
            create_tx_id: res.txId,
            confirmed_round: res.confirmedRound,
            issuer_address: res.issuer,
          },
        });
        await tx.token_allocations.createMany({
          data: allocs.map((a) => ({ ...a, project_token_id: tokenId })),
        });
        await tx.blockchain_transactions.create({
          data: {
            blockchain_name: 'algorand',
            tx_hash: res.txId,
            sender_address: res.issuer,
            asset_id: res.assetId.toString(),
            amount: total.toString(),
            confirmations: 1,
            status: 'confirmed',
            raw_response: {
              type: 'asset_create',
              network: cfg.network,
              confirmed_round: res.confirmedRound.toString(),
              project_id: t.project_id,
            },
          },
        });
        await tx.project_reviews.create({
          data: {
            project_id: t.project_id,
            actor_id: adminId,
            action: 'tokenized',
            from_status: t.project.status,
            to_status: t.project.status ?? 'funded',
            notes: `ASA ${res.assetId} (${cfg.network})`,
          },
        });
      });
      return {
        data: shape(
          await this.prisma.project_tokens.findUnique({
            where: { id: tokenId },
          }),
        ),
      };
    } catch (e: any) {
      const msg = String(e?.message ?? 'Asset creation failed').slice(0, 500);
      this.log.warn(`Tokenization ${tokenId} failed: ${msg}`);
      await this.prisma.project_tokens.update({
        where: { id: tokenId },
        data: { status: 'failed', error: msg },
      });
      throw e instanceof BadRequestException
        ? e
        : new ServiceUnavailableException(
            'Asset creation failed; you can retry',
          );
    }
  }

  // ---------- Investor ----------
  async myTokens(userId: string) {
    const rows = await this.prisma.token_allocations.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        token: {
          include: { project: { select: { id: true, project_name: true } } },
        },
      },
    });
    return {
      data: rows.map((a) => ({
        id: a.id,
        investment_id: a.investment_id,
        units: a.units.toString(),
        custody: a.custody,
        project: a.token.project,
        token: shape({ ...a.token, project: undefined }),
      })),
    };
  }
}
