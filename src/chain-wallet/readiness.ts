/**
 * Read-only on-chain go-live readiness. Uses only public algod REST reads
 * (account balances), never keys, so it can run against a public node.
 */
import { FARM_DECIMALS } from './chain-config';

type Fetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export interface AccountView {
  address: string;
  exists: boolean;
  algo: number;
  minBalance: number;
  spendableAlgo: number;
  farmOptedIn: boolean;
  farm: number;
}

const ALGO = 1_000_000;

export async function fetchAccount(
  nodeUrl: string,
  address: string,
  farmAsaId: string,
  doFetch: Fetch = fetch,
): Promise<AccountView> {
  const r = await doFetch(
    `${nodeUrl.replace(/\/+$/, '')}/v2/accounts/${encodeURIComponent(address)}`,
  );
  if (r.status === 404)
    return {
      address,
      exists: false,
      algo: 0,
      minBalance: 0,
      spendableAlgo: 0,
      farmOptedIn: false,
      farm: 0,
    };
  if (!r.ok) throw new Error(`algod ${r.status} for ${address}`);
  const a = await r.json();
  const holding = (a.assets ?? []).find(
    (x: any) => String(x['asset-id'] ?? x.assetId) === String(farmAsaId),
  );
  const algo = Number(a.amount ?? 0) / ALGO;
  const minBalance = Number(a['min-balance'] ?? a.minBalance ?? 0) / ALGO;
  return {
    address,
    exists: true,
    algo,
    minBalance,
    spendableAlgo: Math.max(0, algo - minBalance),
    farmOptedIn: !!holding,
    farm: holding ? Number(holding.amount) / 10 ** FARM_DECIMALS : 0,
  };
}

export interface DbSnapshot {
  /** Sum of FARM balance + locked_balance in user (non-platform) wallets. */
  userFarm: number;
  /** Users holding FARM in the DB. */
  usersWithBalance: number;
  /** ...of which have no ready custodial address yet. */
  usersWithoutAddress: number;
  /** Custodial addresses in a non-ready state (created/provisioning/failed). */
  walletsNotReady: number;
  readyAddresses: string[];
  outbox: Record<string, number>;
}

export interface ReadinessInput {
  network: string;
  nodeUrl: string;
  farmAsaId: string;
  reserveAddress: string;
  funderAddress?: string;
  missingEnv?: string[];
  db?: DbSnapshot;
  /** microALGO given to each new custodial account (min balance + opt-ins). */
  fundMicroAlgos?: number;
  /** Expected on-chain transfers in the first 30 days (for the fee budget). */
  expectedTransfers?: number;
  /** Max custodial addresses to read (public nodes rate-limit). */
  maxAddresses?: number;
}

export async function chainReadiness(
  i: ReadinessInput,
  doFetch: Fetch = fetch,
) {
  const blockers: string[] = [];
  const notes: string[] = [];
  if (i.missingEnv?.length)
    blockers.push(`Missing env (names): ${i.missingEnv.join(', ')}`);

  const reserve = await fetchAccount(
    i.nodeUrl,
    i.reserveAddress,
    i.farmAsaId,
    doFetch,
  );
  if (!reserve.exists) blockers.push('Reserve account does not exist on chain');
  else if (!reserve.farmOptedIn)
    blockers.push('Reserve is not opted in to the FARM asset');

  const funder = i.funderAddress
    ? await fetchAccount(i.nodeUrl, i.funderAddress, i.farmAsaId, doFetch)
    : null;
  if (!funder)
    notes.push(
      'Funder address unknown (derived from ALGORAND_FUNDER_MNEMONIC on the server); ALGO budget not checked',
    );

  // ALGO budget: the funder pays every fee (fee pooling, Falcon = 3x min fee
  // per signature) and the min balance of each new custodial account.
  const perTransfer = 0.006; // funder + sender, both Falcon: 2 x 3 x 0.001
  const fund = (i.fundMicroAlgos ?? 310_000) / ALGO;
  const toProvision = i.db
    ? i.db.usersWithoutAddress + i.db.walletsNotReady
    : 0;
  const provisioning = toProvision * (fund + 2 * perTransfer); // fund + 2 opt-ins
  const transfers = (i.expectedTransfers ?? 10_000) * perTransfer;
  const algoNeeded = Number((provisioning + transfers).toFixed(6));
  if (funder && funder.spendableAlgo < algoNeeded)
    blockers.push(
      `Funder has ${funder.spendableAlgo} spendable ALGO; about ${algoNeeded} ALGO needed (provisioning ${toProvision} accounts + ${i.expectedTransfers ?? 10_000} transfers)`,
    );

  let onchainUserFarm: number | null = null;
  let checkedAddresses = 0;
  if (i.db) {
    if (i.db.usersWithoutAddress)
      blockers.push(
        `${i.db.usersWithoutAddress} users hold FARM but have no ready custodial address`,
      );
    if (i.db.walletsNotReady)
      notes.push(
        `${i.db.walletsNotReady} custodial addresses are not ready (unfunded / not opted in)`,
      );
    const addrs = i.db.readyAddresses.slice(0, i.maxAddresses ?? 500);
    let sum = 0;
    let notOpted = 0;
    for (const a of addrs) {
      const v = await fetchAccount(i.nodeUrl, a, i.farmAsaId, doFetch);
      if (!v.farmOptedIn) notOpted++;
      sum += v.farm;
    }
    checkedAddresses = addrs.length;
    onchainUserFarm = Number(sum.toFixed(FARM_DECIMALS));
    if (notOpted)
      blockers.push(`${notOpted} ready addresses are not opted in to FARM`);
    if (addrs.length < i.db.readyAddresses.length)
      notes.push(
        `Only ${addrs.length} of ${i.db.readyAddresses.length} addresses read`,
      );
    const gap = i.db.userFarm - onchainUserFarm;
    if (gap > 0) {
      notes.push(
        `DB user FARM exceeds on-chain user FARM by ${gap.toFixed(FARM_DECIMALS)}: run reconciliation (dry, then execute) before switching sync on`,
      );
      if (reserve.farm < gap)
        blockers.push(
          `Reserve holds ${reserve.farm} FARM, less than the ${gap.toFixed(FARM_DECIMALS)} needed to reconcile`,
        );
    }
    const inflight = Object.entries(i.db.outbox)
      .filter(([s]) => s !== 'sent' && s !== 'skipped')
      .reduce((a, [, n]) => a + n, 0);
    if (inflight) notes.push(`${inflight} outbox rows not yet sent`);
  } else notes.push('No database snapshot: user totals not compared');

  return {
    network: i.network,
    farm_asa_id: i.farmAsaId,
    reserve,
    funder,
    db: i.db ? { ...i.db, readyAddresses: i.db.readyAddresses.length } : null,
    onchain_user_farm: onchainUserFarm,
    checked_addresses: checkedAddresses,
    algo_budget: {
      per_transfer: perTransfer,
      per_new_account: Number((fund + 2 * perTransfer).toFixed(6)),
      accounts_to_provision: toProvision,
      expected_transfers: i.expectedTransfers ?? 10_000,
      needed: algoNeeded,
    },
    ready: blockers.length === 0,
    blockers,
    notes,
  };
}
