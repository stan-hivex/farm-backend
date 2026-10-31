/**
 * Tokenization is OFF unless every required env var is set. Values are never
 * returned or logged; only the *names* of missing variables are reported.
 * Only TestNet is allowed in this phase.
 */
export const REQUIRED_ENV = [
  'TOKENIZATION_ENABLED',
  'ALGORAND_NETWORK',
  'ALGORAND_NODE_URL',
  'ALGORAND_ISSUER_MNEMONIC',
] as const;

export interface AlgorandConfig {
  enabled: boolean;
  network: string;
  missing: string[];
  problems: string[];
}

export function algorandConfig(env = process.env): AlgorandConfig {
  const missing = REQUIRED_ENV.filter((k) => !env[k]?.trim());
  const problems: string[] = [];
  if (env.TOKENIZATION_ENABLED && env.TOKENIZATION_ENABLED !== 'true')
    problems.push('TOKENIZATION_ENABLED must be "true"');
  if (env.ALGORAND_NETWORK && env.ALGORAND_NETWORK !== 'testnet')
    problems.push('Only ALGORAND_NETWORK=testnet is supported in this phase');
  if (env.ALGORAND_NODE_URL && !/^https:\/\//.test(env.ALGORAND_NODE_URL))
    problems.push('ALGORAND_NODE_URL must be https');
  return {
    enabled: !missing.length && !problems.length,
    network: env.ALGORAND_NETWORK || 'testnet',
    missing: [...missing],
    problems,
  };
}

export const explorerAsset = (network: string, id: bigint | number | string) =>
  `https://${network === 'testnet' ? 'testnet.' : ''}explorer.perawallet.app/asset/${id}/`;
export const explorerTx = (network: string, tx: string) =>
  `https://${network === 'testnet' ? 'testnet.' : ''}explorer.perawallet.app/tx/${tx}/`;
