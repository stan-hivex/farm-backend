/**
 * Phase 10 x402 config. OFF unless X402_ENABLED=true and the Algorand chain
 * basics are configured. Only variable NAMES are reported, never values.
 */
type Env = Record<string, string | undefined>;
const has = (env: Env, k: string) => !!env[k]?.trim();

export const NETWORKS: Record<string, { caip2: string; genesisHash: string }> = {
  testnet: { caip2: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe', genesisHash: 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=' },
  mainnet: { caip2: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k', genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=' },
};
export const ASSET_DECIMALS: Record<string, number> = { FARM: 2, USDC: 6 };

export interface X402Config {
  enabled: boolean;
  missing: string[];
  problems: string[];
  network: string;
  caip2: string;
  genesisHash: string;
  assets: { FARM?: bigint; USDC?: bigint };
  feePayer: boolean;
  maxFeeMicroAlgos: bigint;
  maxPrice: { FARM: number; USDC: number };
  timeoutSeconds: number;
}

export function x402Config(env: Env = process.env): X402Config {
  const network = env.ALGORAND_NETWORK?.trim() || 'testnet';
  const problems: string[] = [];
  const net = NETWORKS[network];
  if (!net) problems.push('ALGORAND_NETWORK must be testnet or mainnet');
  if (network === 'mainnet' && env.ALGORAND_ALLOW_MAINNET !== 'true')
    problems.push('mainnet is refused unless ALGORAND_ALLOW_MAINNET=true');
  if (has(env, 'ALGORAND_NODE_URL') && !/^https:\/\//.test(env.ALGORAND_NODE_URL!)) problems.push('ALGORAND_NODE_URL must be https');
  for (const k of ['FARM_ASA_ID', 'USDC_ASA_ID'])
    if (has(env, k) && !/^\d+$/.test(env[k]!)) problems.push(`${k} must be a number`);
  const missing = [
    ...(env.X402_ENABLED === 'true' ? [] : ['X402_ENABLED']),
    ...['ALGORAND_NODE_URL', 'WALLET_KEY_ENCRYPTION_KEY'].filter((k) => !has(env, k)),
    ...(has(env, 'FARM_ASA_ID') || has(env, 'USDC_ASA_ID') ? [] : ['FARM_ASA_ID or USDC_ASA_ID']),
  ];
  const assets: X402Config['assets'] = {};
  if (/^\d+$/.test(env.FARM_ASA_ID ?? '')) assets.FARM = BigInt(env.FARM_ASA_ID!);
  if (/^\d+$/.test(env.USDC_ASA_ID ?? '')) assets.USDC = BigInt(env.USDC_ASA_ID!);
  const n = (k: string, d: number) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);
  return {
    enabled: !missing.length && !problems.length,
    missing,
    problems,
    network,
    caip2: net?.caip2 ?? '',
    genesisHash: net?.genesisHash ?? '',
    assets,
    feePayer: env.X402_FEE_PAYER_ENABLED === 'true' && has(env, 'ALGORAND_FUNDER_MNEMONIC'),
    maxFeeMicroAlgos: BigInt(Math.floor(n('X402_MAX_FEE_MICROALGOS', 20000))),
    maxPrice: { FARM: n('X402_MAX_PRICE_FARM', 10000), USDC: n('X402_MAX_PRICE_USDC', 100) },
    timeoutSeconds: Math.min(Math.floor(n('X402_MAX_TIMEOUT_SECONDS', 120)), 600),
  };
}

/** "12.5" FARM -> 1250n base units. Rejects more decimals than the asset has. */
export function toUnits(amount: number | string, asset: string): bigint {
  const d = ASSET_DECIMALS[asset];
  const s = String(amount).trim();
  if (d === undefined || !/^\d+(\.\d+)?$/.test(s)) throw new Error('Invalid amount');
  const [i, f = ''] = s.split('.');
  if (f.length > d) throw new Error(`At most ${d} decimals for ${asset}`);
  return BigInt(i) * 10n ** BigInt(d) + BigInt((f + '0'.repeat(d)).slice(0, d) || '0');
}
export function fromUnits(units: bigint, asset: string): string {
  const d = ASSET_DECIMALS[asset] ?? 0;
  const s = units.toString().padStart(d + 1, '0');
  return d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s;
}
