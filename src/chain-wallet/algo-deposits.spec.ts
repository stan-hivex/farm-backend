import { chainConfig } from './chain-config';
import { randomBytes } from 'crypto';
import { ChainWalletService } from './chain-wallet.service';
import { RateService } from './rate.service';

jest.mock('./key-vault', () => ({
  ...jest.requireActual('./key-vault'),
  walletSigner: jest.fn((row: any) => ({
    scheme: 'falcon1024',
    address: row.address,
    sign: jest.fn(),
    wipe: jest.fn(),
  })),
}));

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
beforeEach(() =>
  Object.assign(process.env, ENV, {
    FARM_RESERVE_MNEMONIC: 'y',
    FARM_ONCHAIN_SYNC_ENABLED: 'true',
  }),
);
afterEach(() => {
  process.env = { ...OLD };
  jest.restoreAllMocks();
});

function svc(
  payments: Record<string, any[]>,
  pending: any[] = [],
  state: any = { key: 'k', last_round: 10n },
) {
  const tx: any = {
    chain_deposits: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    wallets: {
      findFirst: jest.fn().mockResolvedValue({ id: 'w1' }),
      update: jest.fn(),
    },
    transactions: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
    ledger_entries: { create: jest.fn() },
    blockchain_transactions: { create: jest.fn() },
    chain_deposits_update: jest.fn(),
  };
  tx.chain_deposits.update = jest.fn();
  const prisma: any = {
    user_chain_wallets: {
      findMany: jest.fn().mockResolvedValue([
        { address: 'U1', user_id: 'u1', funded_tx_id: 'FUND1' },
        { address: 'U2', user_id: 'u2', funded_tx_id: 'FUND2' },
      ]),
    },
    chain_sync_state: {
      findUnique: jest.fn().mockResolvedValue(state),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(state),
    },
    chain_deposits: {
      createMany: jest.fn((a: any) => ({ count: a.data.length })),
      findMany: jest.fn().mockResolvedValue(pending),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const chain: any = {
    transfersSince: jest.fn().mockResolvedValue([]),
    currentRound: jest.fn().mockResolvedValue(900n),
    funderAddress: jest.fn(() => 'FUNDER'),
    paymentsTo: jest.fn((addr: string) =>
      Promise.resolve(payments[addr] ?? []),
    ),
  };
  const rates: any = {
    usdcKes: jest.fn().mockResolvedValue(null),
    algoKes: jest.fn().mockResolvedValue(null),
  };
  return {
    s: new ChainWalletService(prisma, chain, rates),
    prisma,
    tx,
    rates,
    chain,
  };
}
const pay = (
  txId: string,
  sender: string,
  receiver: string,
  amount: bigint,
) => ({
  txId,
  assetId: 0n,
  sender,
  receiver,
  amount,
  round: 20n,
});

describe('ALGO deposits – detection', () => {
  beforeEach(() => (process.env.CHAIN_DEPOSITS_ENABLED = 'true'));
  it('records external ALGO; ignores funder/provisioning, reserve, custodial and self payments', async () => {
    const { s, prisma } = svc({
      U1: [
        pay('EXT', 'PERA', 'U1', 2_500_000n),
        pay('FUND1', 'SOMEONE', 'U1', 310_000n), // provisioning tx id
        pay('F2', 'FUNDER', 'U1', 100_000n), // any funder top-up
        pay('RES', RES, 'U1', 1n),
        pay('INT', 'U2', 'U1', 5n),
        pay('SELF', 'U1', 'U1', 5n),
        pay('ZERO', 'PERA', 'U1', 0n),
      ],
    });
    await s.pollDeposits();
    const rows = prisma.chain_deposits.createMany.mock.calls.flatMap(
      (c: any) => c[0].data,
    );
    expect(
      rows.map((r: any) => [
        r.tx_id,
        r.asset_symbol,
        r.asset_id,
        r.decimals,
        r.user_id,
      ]),
    ).toEqual([['EXT', 'ALGO', 0n, 6, 'u1']]);
    expect(
      prisma.chain_deposits.createMany.mock.calls.every(
        (c: any) => c[0].skipDuplicates,
      ),
    ).toBe(true);
  });
  it('first run starts from the current round (no backfill)', async () => {
    const { s, prisma, chain } = svc(
      { U1: [pay('EXT', 'PERA', 'U1', 1n)] },
      [],
      null,
    );
    const r = await s.pollAlgo('testnet', RES);
    expect(r).toEqual({ seen: 0, recorded: 0 });
    expect(chain.paymentsTo).not.toHaveBeenCalled();
    expect(prisma.chain_sync_state.create.mock.calls[0][0].data).toEqual({
      key: 'testnet:algo:0',
      last_round: 900n,
    });
  });
  it('advances the cursor to the head round after scanning', async () => {
    const { s, prisma } = svc({});
    await s.pollAlgo('testnet', RES);
    expect(
      prisma.chain_sync_state.update.mock.calls[0][0].data.last_round,
    ).toBe(900n);
  });
});

describe('ALGO deposits – crediting', () => {
  const d = {
    id: 'a1',
    asset_symbol: 'ALGO',
    status: 'detected',
    amount_units: 2_500_000n,
    decimals: 6,
    tx_id: 'EXT',
    asset_id: 0n,
    confirmed_round: 20n,
    network: 'testnet',
    user_id: 'u1',
    sender: 'PERA',
    address: 'U1',
  };
  it('without an ALGO rate the deposit waits as pending_rate', async () => {
    const { s, prisma, tx } = svc({}, [d]);
    expect(await s.creditPending()).toEqual({ credited: 0, waiting: 1 });
    expect(prisma.chain_deposits.updateMany.mock.calls[0][0].data.status).toBe(
      'pending_rate',
    );
    expect(tx.wallets.update).not.toHaveBeenCalled();
  });
  it('credits FARM = ALGO x live rate (after spread), using the ALGO rate source only', async () => {
    Object.assign(process.env, {
      ALGO_KES_RATE_URL: 'https://algo.example',
      ALGO_KES_RATE_JSON_PATH: 'algorand.kes',
    });
    const { s, tx, rates } = svc({}, [d]);
    rates.algoKes.mockResolvedValue({
      rate: 24.5,
      source: 'algo.example',
      at: new Date(),
    });
    expect(await s.creditPending()).toEqual({ credited: 1, waiting: 0 });
    expect(rates.usdcKes).not.toHaveBeenCalled();
    expect(tx.wallets.update.mock.calls[0][0].data.balance.increment).toBe(
      61.25,
    );
    const t = tx.transactions.create.mock.calls[0][0].data;
    expect(t.metadata.asset).toBe('ALGO');
    expect(t.metadata.chain_settled).toBe(false);
    expect(t.description).toBe('Received 2.5 ALGO on Algorand @ 24.5 KSh');
  });
  it('is idempotent: an already-claimed deposit is not credited twice', async () => {
    Object.assign(process.env, {
      ALGO_KES_RATE_URL: 'https://algo.example',
      ALGO_KES_RATE_JSON_PATH: 'algorand.kes',
    });
    const { s, tx, rates } = svc({}, [d]);
    rates.algoKes.mockResolvedValue({
      rate: 24.5,
      source: 'x',
      at: new Date(),
    });
    tx.chain_deposits.updateMany.mockResolvedValue({ count: 0 });
    expect((await s.creditPending()).credited).toBe(0);
    expect(tx.wallets.update).not.toHaveBeenCalled();
  });
});

describe('ALGO rate source', () => {
  it('reads ALGO_KES_RATE_* with the shared spread and its own bounds', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ algorand: { kes: 25 } }),
    } as any);
    const r = await new RateService().algoKes({
      ALGO_KES_RATE_URL: 'https://algo.example',
      ALGO_KES_RATE_JSON_PATH: 'algorand.kes',
      USDC_KES_SPREAD_BPS: '200',
    });
    expect(r?.mid).toBe(25);
    expect(r?.rate).toBeCloseTo(24.5, 6);
  });
  it('no ALGO config => null; config reports ALGO conversion off', async () => {
    expect(await new RateService().algoKes({})).toBeNull();
    expect(chainConfig(ENV).algoConversion.enabled).toBe(false);
    expect(
      chainConfig({
        ...ENV,
        ALGO_KES_RATE_URL: 'https://a.example',
        ALGO_KES_RATE_JSON_PATH: 'x',
      }).algoConversion.enabled,
    ).toBe(true);
  });
});
