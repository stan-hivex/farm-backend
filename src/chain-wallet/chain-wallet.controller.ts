import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Allow, IsOptional } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChainWalletService } from './chain-wallet.service';
import { ChainSyncService } from './chain-sync.service';
import {
  parseBackfillHttpInput,
  redactOperatorMessage,
} from '../ops/backfill-wallets-policy';

@ApiTags('Wallet - Algorand')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'wallet/chain', version: '1' })
export class ChainWalletController {
  constructor(private readonly svc: ChainWalletService) {}
  @Get('status') status() {
    return this.svc.status();
  }
  @Get() mine(@CurrentUser() u: any) {
    return this.svc.mine(u.id);
  }
  @Get('deposits') deposits(@CurrentUser() u: any) {
    return this.svc.myDeposits(u.id);
  }
}

/**
 * 'send' is the real (on-chain) mode. 'execute' is kept as an alias, but the
 * global SafeInputValidationPipe rejects that keyword, so clients use 'send'.
 * Anything else is a dry run.
 */
export function reconcileMode(mode?: string): 'dry' | 'execute' {
  return mode === 'send' || mode === 'execute' ? 'execute' : 'dry';
}

/**
 * JSON body for wallet backfill. Query params mode, limit, expect_count,
 * and expectCount are accepted as well. @Allow() keeps these fields through
 * the global whitelist without treating them as prose or SQL.
 * mode=execute is not a value clients should send: SafeInputValidationPipe
 * rejects the keyword "execute" (the same list that blocks select/drop/…).
 */
export class BackfillWalletsBody {
  @IsOptional()
  @Allow()
  mode?: string;

  @IsOptional()
  @Allow()
  limit?: number | string;

  @IsOptional()
  @Allow()
  expectCount?: number | string;

  @IsOptional()
  @Allow()
  expect_count?: number | string;
}

function httpExceptionMessage(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const message = raw.message;
    if (Array.isArray(message)) return message.map(String).join('; ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

/** Policy errors pass through. Anything else becomes a fixed message with secrets removed. */
export function toPublicBackfillException(error: unknown): HttpException {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const message = httpExceptionMessage(error.getResponse(), error.message);
    const clean = redactOperatorMessage(message);
    if (clean === message) return error;
    return new HttpException({ statusCode: status, message: clean }, status);
  }
  return new ServiceUnavailableException('Wallet backfill failed');
}

@ApiTags('Admin - Algorand')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/chain', version: '1' })
export class AdminChainController {
  private readonly log = new Logger(AdminChainController.name);
  constructor(
    private readonly svc: ChainWalletService,
    private readonly sync: ChainSyncService,
  ) {}
  @Get('outbox') outbox() {
    return this.sync.summary();
  }
  @Post('outbox/process') async processOutbox() {
    const e = await this.sync.enqueue();
    return { data: { ...e, ...(await this.sync.process()) } };
  }
  @Post('outbox/retry') retryOutbox() {
    return this.sync.retryNow();
  }
  @Get('status') status() {
    return this.svc.status();
  }
  @Post('deposits/sync') async syncDeposits() {
    const polled = await this.svc.pollUsdc();
    return { data: { ...polled, ...(await this.svc.creditPending()) } };
  }
  @Get('readiness') readiness(@Query('transfers') transfers?: string) {
    const n = Number(transfers);
    return this.svc.readiness(Number.isFinite(n) && n > 0 ? n : undefined);
  }
  @Get('reconcile') runs() {
    return this.svc.runs();
  }
  @Post('deposits/credit')
  creditDeposit(
    @CurrentUser() u: any,
    @Body()
    body: { tx_id?: string; asset?: string; network?: string; dry?: boolean },
  ) {
    return this.svc.creditDepositByTx({
      txId: body?.tx_id ?? '',
      asset: body?.asset,
      network: body?.network,
      dry: body?.dry === true,
      actorId: u.id,
    });
  }
  @Post('reconcile') reconcile(
    @CurrentUser() u: any,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('address') address?: string,
  ) {
    return this.svc.reconcile(
      u.id,
      reconcileMode(mode),
      Number(limit ?? 100) || 100,
      address,
    );
  }

  /**
   * Custodial Algorand wallet backfill. Dry is the default and creates
   * nothing. mode=send provisions only when expectCount / expect_count
   * equals the dry-run `selected` count and the funder can pay
   * CHAIN_WALLET_FUND_MICROALGOS for every selected user. Limit is 1..100
   * (default 25). Does not move FARM. SUPER_ADMIN only.
   */
  @Post('wallets/backfill')
  @HttpCode(200)
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions('admin:write')
  async backfillWallets(
    @CurrentUser() user: { id?: string | null },
    @Query('mode') queryMode?: string,
    @Query('limit') queryLimit?: string,
    @Query('expect_count') queryExpectSnake?: string,
    @Query('expectCount') queryExpectCamel?: string,
    @Body() body?: BackfillWalletsBody,
  ) {
    const parsed = parseBackfillHttpInput({
      mode: [body?.mode, queryMode],
      limit: [body?.limit, queryLimit],
      expectCount: [
        body?.expectCount,
        body?.expect_count,
        queryExpectCamel,
        queryExpectSnake,
      ],
    });
    if (parsed.refusal) throw new BadRequestException(parsed.refusal);
    try {
      return await this.svc.operatorBackfillWallets({
        mode: parsed.mode,
        limit: parsed.limit,
        expectCount: parsed.expectCount,
        actorId: user?.id ?? null,
      });
    } catch (error) {
      if (!(error instanceof HttpException)) {
        const detail =
          error instanceof Error ? error.message : 'wallet backfill failed';
        this.log.error(
          `wallet backfill failed: ${redactOperatorMessage(detail)}`,
        );
      }
      throw toPublicBackfillException(error);
    }
  }
}
