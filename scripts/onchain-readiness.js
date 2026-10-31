#!/usr/bin/env node
/**
 * Read-only on-chain readiness check against a public Algorand node. No keys.
 *   node scripts/onchain-readiness.js [--reserve ADDR] [--asa ID] [--node URL]
 *        [--funder ADDR] [--transfers N]
 * Needs a build (dist/). Prints JSON; exit code 0 = no chain blockers.
 */
const { chainReadiness } = require('../dist/chain-wallet/readiness');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};

(async () => {
  const r = await chainReadiness({
    network: arg('network', process.env.ALGORAND_NETWORK || 'mainnet'),
    nodeUrl: arg('node', process.env.ALGORAND_NODE_URL || 'https://mainnet-api.algonode.cloud'),
    farmAsaId: arg('asa', process.env.FARM_ASA_ID || '3759208862'),
    reserveAddress: arg(
      'reserve',
      process.env.FARM_RESERVE_ADDRESS ||
        'A4P7SNWVO47VRYUVOHCWZ5OIF6A2XTPSGHMXGWBXN5XCDHJ4E4N5TXDTCI',
    ),
    funderAddress: arg('funder', undefined),
    expectedTransfers: Number(arg('transfers', 10000)),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ready ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
