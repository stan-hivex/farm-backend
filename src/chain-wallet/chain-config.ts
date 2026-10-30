/**
 * Phase 6 feature flags. Everything is OFF until configured. Only variable
 * NAMES are ever reported; values (keys, mnemonics, tokens) never leave here.
 */
type Env = Record<string, string | undefined>;
const has = (env: Env, k: string) => !!env[k]?.trim();

export interface ChainConfig {
  network: string;
  wallets: { enabled: boolean; missing: string[]; problems: string[] };
  deposits: { enabled: boolean; missing: string[] };
  conversion: { enabled: boolean; missing: string[] };
  mirror: { enabled: boolean; missing: string[] };
}

export function chainConfig(env: Env = process.env): ChainConfig {
  const network = env.ALGORAND_NETWORK?.trim() || 'testnet';
  const problems: string[] = [];
  if (!['testnet', 'mainnet'].includes(network))
    problems.push('ALGORAND_NETWORK must be testnet or mainnet');
  if (network === 'mainnet' && env.ALGORAND_ALLOW_MAINNET !== 'true')
    problems.push('mainnet is refused unless ALGORAND_ALLOW_MAINNET=true');
  for (const k of ['ALGORAND_NODE_URL', 'ALGORAND_INDEXER_URL'])
    if (has(env, k) && !/^https:\/\//.test(env[k]!))
      problems.push(`${k} must be https`);
  const key = env.WALLET_KEY_ENCRYPTION_KEY;
  if (key && Buffer.from(key, 'base64').length !== 32)
    problems.push('WALLET_KEY_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  if (has(env, 'CHAIN_WALLETS_ENABLED') && env.CHAIN_WALLETS_ENABLED !== 'true')
    problems.push('CHAIN_WALLETS_ENABLED must be "true"');
  for (const k of ['FARM_ASA_ID', 'USDC_ASA_ID'])
    if (has(env, k) && !/^\d+$/.test(env[k]!))
      problems.push(`${k} must be a number`);

  const wMissing = [
    'CHAIN_WALLETS_ENABLED',
    'ALGORAND_NETWORK',
    'ALGORAND_NODE_URL',
    'ALGORAND_INDEXER_URL',
    'ALGORAND_ISSUER_MNEMONIC',
    'WALLET_KEY_ENCRYPTION_KEY',
    'USDC_ASA_ID',
    'FARM_ASA_ID',
  ].filter((k) => !has(env, k));
  const walletsOn = !wMissing.length && !problems.length;
  const dMissing =
    env.CHAIN_DEPOSITS_ENABLED === 'true' ? [] : ['CHAIN_DEPOSITS_ENABLED'];
  const cMissing = ['USDC_KES_RATE_URL', 'USDC_KES_RATE_JSON_PATH'].filter(
    (k) => !has(env, k),
  );
  if (
    has(env, 'USDC_KES_RATE_URL') &&
    !/^https:\/\//.test(env.USDC_KES_RATE_URL!)
  )
    cMissing.push('USDC_KES_RATE_URL (must be https)');
  const mMissing =
    env.FARM_ONCHAIN_MIRROR_ENABLED === 'true'
      ? []
      : ['FARM_ONCHAIN_MIRROR_ENABLED'];
  return {
    network,
    wallets: { enabled: walletsOn, missing: wMissing, problems },
    deposits: { enabled: walletsOn && !dMissing.length, missing: dMissing },
    conversion: { enabled: walletsOn && !cMissing.length, missing: cMissing },
    mirror: { enabled: walletsOn && !mMissing.length, missing: mMissing },
  };
}

export const USDC_DECIMALS = 6;
/** FARM ASA: 2 decimals, 1 FARM = 1 KSh => 1 base unit = 0.01 KSh. */
export const FARM_DECIMALS = 2;
