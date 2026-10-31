import { chainReadiness, fetchAccount } from './readiness';

const acct = (o: any = {}) => ({
  amount: 10_000_000,
  'min-balance': 300_000,
  assets: [{ 'asset-id': 9, amount: 1_000_000 }],
  ...o,
});
const fake =
  (m: Record<string, any>) =>
  (url: string): Promise<any> => {
    const a = url.split('/').pop()!;
    const v = m[a];
    return Promise.resolve({
      ok: !!v,
      status: v ? 200 : 404,
      json: () => Promise.resolve(v),
    });
  };

describe('on-chain readiness (read-only)', () => {
  it('reads ALGO, min balance and FARM (2 decimals)', async () => {
    const v = await fetchAccount('https://n', 'R', '9', fake({ R: acct() }));
    expect(v).toMatchObject({
      exists: true,
      algo: 10,
      minBalance: 0.3,
      spendableAlgo: 9.7,
      farmOptedIn: true,
      farm: 10_000,
    });
  });

  it('reports blockers: missing env, users without addresses, short funder, not opted in', async () => {
    const r = await chainReadiness(
      {
        network: 'mainnet',
        nodeUrl: 'https://n',
        farmAsaId: '9',
        reserveAddress: 'R',
        funderAddress: 'F',
        missingEnv: ['FARM_ONCHAIN_SYNC_ENABLED'],
        expectedTransfers: 1000,
        db: {
          userFarm: 150,
          usersWithBalance: 3,
          usersWithoutAddress: 1,
          walletsNotReady: 0,
          readyAddresses: ['U1', 'U2'],
          outbox: { sent: 4, blocked: 1 },
        },
      },
      fake({
        R: acct(),
        F: acct({ amount: 1_000_000, assets: [] }),
        U1: acct({ assets: [{ 'asset-id': 9, amount: 5000 }] }),
        U2: acct({ assets: [] }),
      }),
    );
    expect(r.ready).toBe(false);
    expect(r.onchain_user_farm).toBe(50);
    expect(r.blockers.join('|')).toMatch(/FARM_ONCHAIN_SYNC_ENABLED/);
    expect(r.blockers.join('|')).toMatch(/1 users hold FARM/);
    expect(r.blockers.join('|')).toMatch(/1 ready addresses are not opted in/);
    expect(r.blockers.join('|')).toMatch(/Funder has 0.7 spendable ALGO/);
    expect(r.notes.join('|')).toMatch(/exceeds on-chain user FARM by 100.00/);
    expect(r.notes.join('|')).toMatch(/1 outbox rows not yet sent/);
  });

  it('a funded, opted-in reserve with no DB snapshot has no chain blockers', async () => {
    const r = await chainReadiness(
      {
        network: 'mainnet',
        nodeUrl: 'https://n',
        farmAsaId: '9',
        reserveAddress: 'R',
      },
      fake({ R: acct() }),
    );
    expect(r.ready).toBe(true);
    expect(r.reserve.farm).toBe(10_000);
  });

  it('missing reserve account is a blocker', async () => {
    const r = await chainReadiness(
      {
        network: 'mainnet',
        nodeUrl: 'https://n',
        farmAsaId: '9',
        reserveAddress: 'X',
      },
      fake({}),
    );
    expect(r.blockers[0]).toMatch(/does not exist/);
  });
});
