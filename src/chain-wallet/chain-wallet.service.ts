import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { generateTxReference } from '../common/utils/reference.util';
import { AlgorandWalletClient } from './algorand-wallet.client';
import { RateService } from './rate.service';
import { chainConfig, FARM_DECIMALS, USDC_DECIMALS } from './chain-config';
import { openSecret, sealSecret } from './key-vault';

const explorer = (net: string) =>
  `https://${net === 'testnet' ? 'testnet.' : ''}explorer.perawallet.app`;

@Injectable()
export class ChainWalletService {
  private readonly log = new Logger(ChainWalletService.name);
  private polling = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: AlgorandWalletClient,
    private readonly rates: RateService,
  ) {}

  status() {
    const c = chainConfig();
    return {
      data: {
        network: c.network,
        wallets: c.wallets,
        deposits: c.deposits,
        conversion: c.conversion,
        mirror: c.mirror,
        usdc_asa_id: c.wallets.enabled ? process.env.USDC_ASA_ID : null,
        farm_asa_id: c.wallets.enabled ? process.env.FARM_ASA_ID : null,
        peg: '1 FARM = 1 KSh',
      },
    };
  }

  private present(w: any) {
    return {
      address: w.address,
      network: w.network,
      status: w.status,
      ready: w.status === 'ready',
      usdc_asa_id: process.env.USDC_ASA_ID ?? null,
      farm_asa_id: process.env.FARM_ASA_ID ?? null,
      explorer_url: `${explorer(w.network)}/address/${w.address}/`,
    };
  }

  /** Returns (and on first call creates) the user's custodial address. */
  async mine(userId: string) {
    const c = chainConfig();
    if (!c.wallets.enabled) return { data: null, enabled: false };
    let w = await this.prisma.user_chain_wallets.findUnique({
      where: { user_id: userId },
    });
    if (!w) {
      const acct = this.chain.newAccount();
      try {
        w = await this.prisma.user_chain_wallets.create({
          data: {
            user_id: userId,
            network: c.network,
            address: acct.address,
            ...sealSecret(acct.sk, acct.address),
          },
        });
      } catch {
        // concurrent first call: the other request won (unique user_id)
        w = await this.prisma.user_chain_wallets.findUnique({
          where: { user_id: userId },
        });
      } finally {
        acct.sk.fill(0);
      }
      if (!w) throw new ServiceUnavailableException('Could not create wallet');
    }
    if (w.status === 'created' || w.status === 'failed')
      void this.provision(w.id).catch(() => undefined);
    return { data: this.present(w), enabled: true };
  }

  /** Fund min-balance and opt in to USDC + FARM. Each step is resumable. */
  async provision(id: string) {
    const claim = await this.prisma.user_chain_wallets.updateMany({
      where: { id, status: { in: ['created', 'failed'] } },
      data: { status: 'provisioning', error: null },
    });
    if (!claim.count) return;
    const w = (await this.prisma.user_chain_wallets.findUnique({
      where: { id },
    }))!;
    let sk: Uint8Array | null = null;
    try {
      const data: Record<string, string> = {};
      if (!w.funded_tx_id)
        data.funded_tx_id = await this.chain.fund(
          w.address,
          BigInt(process.env.CHAIN_WALLET_FUND_MICROALGOS ?? '310000'),
        );
      sk = openSecret(w, w.address);
      if (!w.usdc_opt_in_tx)
        data.usdc_opt_in_tx = await this.chain.optIn(
          w.address,
          sk,
          BigInt(process.env.USDC_ASA_ID!),
        );
      if (!w.farm_opt_in_tx)
        data.farm_opt_in_tx = await this.chain.optIn(
          w.address,
          sk,
          BigInt(process.env.FARM_ASA_ID!),
        );
      await this.prisma.user_chain_wallets.update({
        where: { id },
        data: { ...data, status: 'ready' },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? 'provisioning failed').slice(0, 300);
      this.log.warn(`Wallet ${id} provisioning failed: ${msg}`);
      await this.prisma.user_chain_wallets.update({
        where: { id },
        data: { status: 'failed', error: msg },
      });
    } finally {
      sk?.fill(0);
    }
  }

  async myDeposits(userId: string) {
    const rows = await this.prisma.chain_deposits.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((d) => ({
        id: d.id,
        tx_id: d.tx_id,
        asset: d.asset_symbol,
        amount: Number(d.amount_units) / 10 ** d.decimals,
        status: d.status,
        rate_kes: d.rate_kes == null ? null : Number(d.rate_kes),
        rate_source: d.rate_source,
        farm_amount: d.farm_amount == null ? null : Number(d.farm_amount),
        created_at: d.created_at,
        tx_url: `${explorer(d.network)}/tx/${d.tx_id}/`,
      })),
    };
  }

  // ---------------- Deposits ----------------

  @Interval('chain-deposit-poll', 60_000)
  async scheduledPoll() {
    if (!chainConfig().deposits.enabled || this.polling) return;
    this.polling = true;
    try {
      await this.pollUsdc();
      await this.creditPending();
    } catch (e: any) {
      this.log.warn(`Deposit poll failed: ${e?.message ?? e}`);
    } finally {
      this.polling = false;
    }
  }

  /** Records new USDC transfers into custodial addresses. Idempotent. */
  async pollUsdc() {
    const c = chainConfig();
    if (!c.deposits.enabled)
      throw new ServiceUnavailableException('Deposits are disabled');
    const asset = BigInt(process.env.USDC_ASA_ID!);
    const key = `${c.network}:usdc:${asset}`;
    let cur = await this.prisma.chain_sync_state.findUnique({ where: { key } });
    if (!cur) {
      // start from "now": nothing before go-live is backfilled
      const r = await this.chain.currentRound();
      cur = await this.prisma.chain_sync_state.create({
        data: { key, last_round: r },
      });
    }
    const txs = await this.chain.transfersSince(asset, cur.last_round);
    const addrs = [...new Set(txs.map((t) => t.receiver))];
    const owners = addrs.length
      ? await this.prisma.user_chain_wallets.findMany({
          where: { address: { in: addrs }, network: c.network },
          select: { address: true, user_id: true },
        })
      : [];
    const byAddr = new Map(owners.map((o) => [o.address, o.user_id]));
    const rows = txs
      .filter(
        (t) =>
          byAddr.has(t.receiver) && t.amount > 0n && t.sender !== t.receiver,
      )
      .map((t) => ({
        network: c.network,
        tx_id: t.txId,
        asset_id: t.assetId,
        asset_symbol: 'USDC',
        user_id: byAddr.get(t.receiver)!,
        address: t.receiver,
        sender: t.sender,
        amount_units: t.amount,
        decimals: USDC_DECIMALS,
        confirmed_round: t.round,
      }));
    const ins = rows.length
      ? await this.prisma.chain_deposits.createMany({
          data: rows,
          skipDuplicates: true,
        })
      : { count: 0 };
    const maxRound = txs.reduce(
      (m, t) => (t.round > m ? t.round : m),
      cur.last_round,
    );
    if (maxRound > cur.last_round)
      await this.prisma.chain_sync_state.update({
        where: { key },
        data: { last_round: maxRound },
      });
    return {
      seen: txs.length,
      recorded: ins.count,
      cursor: maxRound.toString(),
    };
  }

  /** Converts recorded USDC deposits to FARM at the live configured rate. */
  async creditPending() {
    const pending = await this.prisma.chain_deposits.findMany({
      where: { status: { in: ['detected', 'pending_rate'] } },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
    if (!pending.length) return { credited: 0, waiting: 0 };
    const rate = chainConfig().conversion.enabled
      ? await this.rates.usdcKes()
      : null;
    if (!rate) {
      await this.prisma.chain_deposits.updateMany({
        where: { id: { in: pending.map((d) => d.id) }, status: 'detected' },
        data: { status: 'pending_rate' },
      });
      return { credited: 0, waiting: pending.length };
    }
    let credited = 0;
    for (const d of pending) {
      try {
        if (await this.credit(d, rate)) credited++;
      } catch (e: any) {
        this.log.warn(`Credit of deposit ${d.id} failed: ${e?.message ?? e}`);
      }
    }
    return { credited, waiting: pending.length - credited };
  }

  private async credit(
    d: any,
    rate: { rate: number; source: string; at: Date },
  ) {
    const usdc = Number(d.amount_units) / 10 ** d.decimals;
    const farm =
      Math.floor(usdc * rate.rate * 10 ** FARM_DECIMALS) / 10 ** FARM_DECIMALS;
    if (!(farm > 0)) return false;
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.chain_deposits.updateMany({
        where: { id: d.id, status: { in: ['detected', 'pending_rate'] } },
        data: {
          status: 'credited',
          rate_kes: rate.rate,
          rate_source: rate.source,
          rate_at: rate.at,
          farm_amount: farm,
          credited_at: new Date(),
        },
      });
      if (!claim.count) return false; // someone else credited it
      const w = await tx.wallets.findFirst({
        where: { user_id: d.user_id, is_active: true },
      });
      if (!w) throw new BadRequestException('User wallet not found');
      await tx.wallets.update({
        where: { id: w.id },
        data: { balance: { increment: farm } },
      });
      const t = await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          receiver_wallet_id: w.id,
          transaction_type: 'deposit',
          status: 'completed',
          amount: farm,
          fee: 0,
          net_amount: farm,
          description: `USDC deposit ${usdc} @ ${rate.rate} KSh`,
          metadata: {
            chain_deposit_id: d.id,
            tx_id: d.tx_id,
            asset: 'USDC',
            rate: rate.rate,
            rate_source: rate.source,
          },
          processed_at: new Date(),
        },
      });
      await tx.ledger_entries.create({
        data: {
          transaction_id: t.id,
          wallet_id: w.id,
          entry_type: 'credit',
          amount: farm,
          description: 'USDC deposit',
        },
      });
      await tx.blockchain_transactions.create({
        data: {
          transaction_id: t.id,
          blockchain_name: 'algorand',
          tx_hash: d.tx_id,
          sender_address: d.sender,
          receiver_address: d.address,
          asset_id: d.asset_id.toString(),
          amount: usdc,
          status: 'confirmed',
          raw_response: {
            network: d.network,
            confirmed_round: d.confirmed_round.toString(),
          },
        },
      });
      await tx.chain_deposits.update({
        where: { id: d.id },
        data: { transaction_id: t.id },
      });
      return true;
    });
  }

  // ---------------- FARM ledger -> chain reconciliation ----------------

  /**
   * dry: compare each ready wallet's internal FARM balance with its on-chain
   * FARM holding and record the difference. execute (FARM_ONCHAIN_MIRROR_ENABLED):
   * also top up positive differences from the issuer reserve. Never debits the
   * ledger; the internal ledger stays the source of truth.
   */
  async reconcile(adminId: string, mode: 'dry' | 'execute', limit = 100) {
    const c = chainConfig();
    if (!c.wallets.enabled)
      throw new ServiceUnavailableException('Chain wallets are disabled');
    if (mode === 'execute' && !c.mirror.enabled)
      throw new ServiceUnavailableException({
        message: 'Mirror is disabled',
        missing: c.mirror.missing,
      });
    const farmAsa = BigInt(process.env.FARM_ASA_ID!);
    const ws = await this.prisma.user_chain_wallets.findMany({
      where: { status: 'ready', network: c.network },
      take: Math.min(Math.max(limit, 1), 500),
      orderBy: { created_at: 'asc' },
    });
    const run = await this.prisma.farm_reconciliation_runs.create({
      data: { network: c.network, mode, ledger_total: 0, started_by: adminId },
    });
    let ledgerTotal = 0;
    let chainTotal = 0;
    try {
      for (const w of ws) {
        const agg = await this.prisma.wallets.aggregate({
          where: { user_id: w.user_id, is_active: true, currency: 'FARM' },
          _sum: { balance: true },
        });
        const ledger = Number(agg._sum.balance ?? 0);
        const ledgerUnits = BigInt(Math.floor(ledger * 10 ** FARM_DECIMALS));
        const chainUnits = await this.chain.assetBalance(w.address, farmAsa);
        const delta = ledgerUnits - chainUnits;
        ledgerTotal += ledger;
        chainTotal += Number(chainUnits) / 10 ** FARM_DECIMALS;
        let status =
          delta === 0n
            ? 'matched'
            : delta > 0n
              ? 'planned'
              : 'chain_above_ledger';
        let txId: string | null = null;
        if (mode === 'execute' && delta > 0n) {
          txId = await this.chain.sendFromIssuer(w.address, farmAsa, delta);
          status = 'sent';
        }
        await this.prisma.farm_mirror_entries.create({
          data: {
            run_id: run.id,
            user_id: w.user_id,
            address: w.address,
            ledger_bal: ledger,
            chain_bal: Number(chainUnits) / 10 ** FARM_DECIMALS,
            delta_units: delta,
            tx_id: txId,
            status,
          },
        });
      }
      await this.prisma.farm_reconciliation_runs.update({
        where: { id: run.id },
        data: {
          status: 'done',
          ledger_total: ledgerTotal,
          chain_total: chainTotal,
          wallets: ws.length,
          finished_at: new Date(),
        },
      });
    } catch (e: any) {
      await this.prisma.farm_reconciliation_runs.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: String(e?.message ?? e).slice(0, 300),
          ledger_total: ledgerTotal,
          finished_at: new Date(),
        },
      });
      throw new ServiceUnavailableException(
        'Reconciliation stopped; see run record',
      );
    }
    return {
      data: {
        run_id: run.id,
        mode,
        wallets: ws.length,
        ledger_total: ledgerTotal,
        chain_total: chainTotal,
      },
    };
  }

  async runs() {
    const r = await this.prisma.farm_reconciliation_runs.findMany({
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    return {
      data: r.map((x) => ({
        ...x,
        ledger_total: Number(x.ledger_total),
        chain_total: x.chain_total == null ? null : Number(x.chain_total),
      })),
    };
  }
}
