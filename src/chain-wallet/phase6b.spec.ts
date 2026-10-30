import { chainConfig } from './chain-config';
import { ChainSyncService } from './chain-sync.service';
import { ChainWalletService } from './chain-wallet.service';
import { RateService } from './rate.service';
import { sealSecret } from './key-vault';
import { randomBytes } from 'crypto';

const RES = 'R'.repeat(58);
const KEY = randomBytes(32).toString('base64');
const ENV: Record<string, string> = {
  CHAIN_WALLETS_ENABLED: 'true',
  ALGORAND_NETWORK: 'testnet',
  ALGORAND_NODE_URL: 'https://node.example',
  ALGORAND_INDEXER_URL: 'https://idx.example',
  ALGORAND_FUNDER_MNEMONIC: 'x',
  FARM_RESERVE_ADDRESS: RES,
  WALLET_KEY_ENCRYPTION_KEY: KEY,
  USDC_ASA_ID: '10458941',
  FARM_ASA_ID: '42',
};
const OLD = { ...process.env };
beforeEach(() => Object.assign(process.env, ENV, { FARM_RESERVE_MNEMONIC: 'y', FARM_ONCHAIN_SYNC_ENABLED: 'true' }));
afterEach(() => {
  process.env = { ...OLD };
  jest.restoreAllMocks();
});

describe('Phase 6b – config', () => {
  it('wallets need the funder + a valid reserve address; sync needs its flag + reserve key', () => {
    expect(chainConfig({ ...ENV, FARM_RESERVE_ADDRESS: 'bad' }).wallets.enabled).toBe(false);
    expect(chainConfig(ENV).sync.enabled).toBe(false);
    expect(chainConfig({ ...ENV, FARM_ONCHAIN_SYNC_ENABLED: 'true' }).sync.missing).toContain('FARM_RESERVE_MNEMONIC');
    const c = chainConfig({ ...ENV, FARM_ONCHAIN_SYNC_ENABLED: 'true', FARM_RESERVE_MNEMONIC: 'top secret words' });
    expect(c.sync.enabled).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/top secret/);
  });
});

describe('Phase 6b – rate fallback + spread', () => {
  const env = {
    USDC_KES_RATE_URL: 'https://primary.example',
    USDC_KES_RATE_JSON_PATH: 'usd-coin.kes',
    USDC_KES_RATE_FALLBACK_URL: 'https://fallback.example',
    USDC_KES_RATE_FALLBACK_JSON_PATH: 'rates.KES',
    USDC_KES_SPREAD_BPS: '150',
  };
  it('falls back when the primary fails and applies the spread in FARM’s favour', async () => {
    jest.spyOn(global, 'fetch' as any).mockImplementation(((url: string) =>
      url.startsWith('https://primary')
        ? Promise.reject(new Error('down'))
        : Promise.resolve({ ok: true, json: async () => ({ rates: { KES: 130 } }) })) as any);
    const r = await new RateService().usdcKes(env);
    expect(r?.mid).toBe(130);
    expect(r?.rate).toBeCloseTo(128.05, 2);
    expect(r?.spread_bps).toBe(150);
  });
  it('both sources down => no rate', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('down'));
    expect(await new RateService().usdcKes(env)).toBeNull();
  });
});

describe('Phase 6b – FARM from outside is a 1:1 deposit', () => {
  function svc(farmTransfers: any[], pending: any[] = []) {
    const tx: any = {
      chain_deposits: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
      wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }), update: jest.fn() },
      transactions: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      ledger_entries: { create: jest.fn() },
      blockchain_transactions: { create: jest.fn() },
    };
    const prisma: any = {
      user_chain_wallets: { findMany: jest.fn().mockResolvedValue([{ address: 'U1', user_id: 'u1' }, { address: 'U2', user_id: 'u2' }]) },
      chain_sync_state: { findUnique: jest.fn().mockResolvedValue({ key: 'k', last_round: 1n }), update: jest.fn() },
      chain_deposits: { createMany: jest.fn((a: any) => ({ count: a.data.length })), findMany: jest.fn().mockResolvedValue(pending), updateMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const chain: any = { transfersSince: jest.fn((a: bigint) => Promise.resolve(a === 42n ? farmTransfers : [])) };
    const rates: any = { usdcKes: jest.fn().mockResolvedValue(null) };
    return { s: new ChainWalletService(prisma, chain, rates), prisma, tx, rates };
  }
  it('records external FARM but not internal sync moves (reserve / custodial senders)', async () => {
    process.env.CHAIN_DEPOSITS_ENABLED = 'true';
    const { s, prisma } = svc([
      { txId: 'X', assetId: 42n, sender: 'PERA', receiver: 'U1', amount: 1500n, round: 5n },
      { txId: 'Y', assetId: 42n, sender: RES, receiver: 'U1', amount: 100n, round: 6n },
      { txId: 'Z', assetId: 42n, sender: 'U2', receiver: 'U1', amount: 100n, round: 7n },
    ]);
    await s.pollDeposits();
    const rows = prisma.chain_deposits.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.tx_id, r.asset_symbol, r.decimals])).toEqual([['X', 'FARM', 2]]);
  });
  it('credits FARM 1:1 even with no USDC rate, marked chain_settled so it is not moved again', async () => {
    const d = { id: 'd1', asset_symbol: 'FARM', status: 'detected', amount_units: 1500n, decimals: 2, tx_id: 'X', asset_id: 42n, confirmed_round: 5n, network: 'testnet', user_id: 'u1', sender: 'PERA', address: 'U1' };
    const { s, tx, rates } = svc([], [d]);
    expect(await s.creditPending()).toEqual({ credited: 1, waiting: 0 });
    expect(rates.usdcKes).not.toHaveBeenCalled();
    expect(tx.wallets.update.mock.calls[0][0].data.balance.increment).toBe(15);
    const t = tx.transactions.create.mock.calls[0][0].data;
    expect(t.metadata.chain_settled).toBe(true);
    expect(t.metadata.rate).toBe(1);
  });
});

describe('Phase 6b – on-chain outbox', () => {
  function sync(over: any = {}) {
    const sealed = sealSecret(new Uint8Array(64).fill(3), 'U1');
    const prisma: any = {
      chain_sync_state: { findUnique: jest.fn().mockResolvedValue({ key: 'k', last_round: 0n }), create: jest.fn(), update: jest.fn() },
      transactions: { findMany: jest.fn().mockResolvedValue(over.txs ?? []) },
      wallets: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'wa', user_id: 'u1', wallet_type: 'user' },
          { id: 'wb', user_id: 'u2', wallet_type: 'user' },
          { id: 'wc', user_id: 'u3', wallet_type: 'user' },
        ]),
      },
      user_chain_wallets: {
        findMany: jest.fn().mockResolvedValue([{ user_id: 'u1', address: 'U1' }, { user_id: 'u2', address: 'U2' }]),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.address === 'U1' || where.address === 'U2' ? { address: where.address, status: 'ready', ...sealed } : null)),
      },
      chain_outbox: {
        createMany: jest.fn((a: any) => ({ count: a.data.length })),
        updateMany: jest.fn().mockResolvedValue({ count: over.claim ?? 1 }),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue(over.rows ?? []),
      },
    };
    const send = jest.fn().mockResolvedValue(undefined);
    const chain: any = {
      assetBalance: jest.fn().mockResolvedValue(over.balance ?? 1_000_000n),
      txStatus: jest.fn().mockResolvedValue(over.status ?? 'unknown'),
      currentRound: jest.fn().mockResolvedValue(over.round ?? 500n),
      reserveSk: jest.fn(() => new Uint8Array(64).fill(9)),
      prepareFarmTransfer: jest.fn().mockResolvedValue({ txId: 'NEWTX', lastValid: 1500n, send }),
    };
    return { s: new ChainSyncService(prisma, chain), prisma, chain, send };
  }
  const row = (o: any = {}) => ({ id: 'o1', transaction_id: 't1', leg: 'main', status: 'pending', attempts: 0, from_address: 'U1', to_address: 'U2', amount_units: 1000n, tx_id: null, last_valid: null, ...o });

  it('enqueues net + fee legs once (skipDuplicates), unprovisioned users fall back to the reserve, settled deposits skipped', async () => {
    const { s, prisma } = sync({
      txs: [
        { id: 't1', sender_wallet_id: 'wa', receiver_wallet_id: 'wb', amount: 100, fee: 2, net_amount: 98, metadata: {}, created_at: new Date(1) },
        { id: 't2', sender_wallet_id: 'wa', receiver_wallet_id: 'wc', amount: 10, fee: 0, net_amount: 10, metadata: {}, created_at: new Date(2) },
        { id: 't3', sender_wallet_id: null, receiver_wallet_id: 'wa', amount: 15, fee: 0, net_amount: 15, metadata: { chain_settled: true }, created_at: new Date(3) },
      ],
    });
    await s.enqueue();
    const a = prisma.chain_outbox.createMany.mock.calls[0][0];
    expect(a.skipDuplicates).toBe(true);
    expect(a.data.map((r: any) => [r.transaction_id, r.leg, r.from_address, r.to_address, r.amount_units])).toEqual([
      ['t1', 'main', 'U1', 'U2', 9800n],
      ['t1', 'fee', 'U1', RES, 200n],
      ['t2', 'main', 'U1', RES, 1000n],
    ]);
    expect(prisma.chain_sync_state.update.mock.calls[0][0].data.last_round).toBe(3n);
  });
  it('flag off => nothing is enqueued or sent', async () => {
    delete process.env.FARM_ONCHAIN_SYNC_ENABLED;
    const { s, prisma } = sync({ rows: [row()] });
    expect(await s.enqueue()).toMatchObject({ disabled: true });
    expect(await s.process()).toMatchObject({ disabled: true });
    expect(prisma.chain_outbox.findMany).not.toHaveBeenCalled();
  });
  it('stores txId before sending, then marks sent', async () => {
    const { s, prisma, send } = sync();
    expect(await s.processOne(row())).toBe(true);
    const ups = prisma.chain_outbox.update.mock.calls.map((c: any) => c[0].data);
    expect(ups[0]).toEqual({ tx_id: 'NEWTX', last_valid: 1500n });
    expect(send).toHaveBeenCalled();
    expect(ups[1].status).toBe('sent');
  });
  it('a row claimed by another worker is not sent', async () => {
    const { s, chain } = sync({ claim: 0 });
    expect(await s.processOne(row())).toBe(false);
    expect(chain.prepareFarmTransfer).not.toHaveBeenCalled();
  });
  it('retry: confirmed previous txId => marked sent without resending', async () => {
    const { s, chain, prisma } = sync({ status: 'confirmed' });
    expect(await s.processOne(row({ status: 'failed', tx_id: 'OLD', last_valid: 900n }))).toBe(true);
    expect(chain.prepareFarmTransfer).not.toHaveBeenCalled();
    expect(prisma.chain_outbox.update.mock.calls[0][0].data.status).toBe('sent');
  });
  it('retry: unknown txId still inside its validity window => waits, never double-sends', async () => {
    const { s, chain } = sync({ status: 'unknown', round: 800n });
    expect(await s.processOne(row({ status: 'failed', tx_id: 'OLD', last_valid: 900n }))).toBe(false);
    expect(chain.prepareFarmTransfer).not.toHaveBeenCalled();
  });
  it('retry: expired unknown txId => rebuilt and sent', async () => {
    const { s, chain } = sync({ status: 'unknown', round: 901n });
    expect(await s.processOne(row({ status: 'failed', tx_id: 'OLD', last_valid: 900n }))).toBe(true);
    expect(chain.prepareFarmTransfer).toHaveBeenCalled();
  });
  it('receive-only: an external destination is never paid', async () => {
    const { s, chain, prisma } = sync();
    expect(await s.processOne(row({ to_address: 'EXTERNAL' }))).toBe(false);
    expect(chain.prepareFarmTransfer).not.toHaveBeenCalled();
    expect(prisma.chain_outbox.update.mock.calls[0][0].data.last_error).toMatch(/receive-only/);
  });
  it('insufficient on-chain FARM => blocked for retry, nothing sent', async () => {
    const { s, chain, prisma } = sync({ balance: 10n });
    expect(await s.processOne(row())).toBe(false);
    expect(prisma.chain_outbox.update.mock.calls[0][0].data.status).toBe('blocked');
    expect(chain.prepareFarmTransfer).not.toHaveBeenCalled();
  });
  it('reserve legs sign with the reserve key', async () => {
    const { s, chain } = sync();
    await s.processOne(row({ from_address: RES, to_address: 'U1' }));
    expect(chain.reserveSk).toHaveBeenCalled();
    expect(chain.prepareFarmTransfer.mock.calls[0][0].from).toBe(RES);
  });
});
