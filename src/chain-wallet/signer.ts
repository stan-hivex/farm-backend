import algosdk from 'algosdk';
import { falcon1024 } from '@algorandfoundation/falcon-wasm';

export type KeyScheme = 'ed25519' | 'falcon1024';

/** Default scheme for server keys and NEW custodial wallets. */
export function keyScheme(env = process.env): KeyScheme {
  return env.ALGORAND_KEY_SCHEME === 'ed25519' ? 'ed25519' : 'falcon1024';
}

/** Per-role override (e.g. FARM_RESERVE_KEY_SCHEME), else ALGORAND_KEY_SCHEME. */
export function roleScheme(role: string, env = process.env): KeyScheme {
  const v = env[`${role}_KEY_SCHEME`];
  if (v === 'ed25519' || v === 'falcon1024') return v;
  return keyScheme(env);
}

/** Falcon-signed txns carry a ~1.5 KB signature: the network charges 3x min fee. */
export const FEE_MULTIPLIER: Record<KeyScheme, bigint> = {
  ed25519: 1n,
  falcon1024: 3n,
};

export interface AlgoSigner {
  scheme: KeyScheme;
  address: string;
  /** Signs each txn (already grouped). Returns raw signed bytes. */
  sign(txns: algosdk.Transaction[]): Promise<Uint8Array[]>;
  /** Best-effort wipe of key material held by this signer. */
  wipe(): void;
}

/**
 * Builds a signer from a 25-word Algorand mnemonic. For falcon1024 the
 * Falcon-1024 key is derived exactly like Pera/algosdk (pq25WordMnemonicToSeed),
 * so the same 25 words open the account in Pera's "Quantum account".
 */
export function signerFromMnemonic(
  mnemonic: string,
  scheme: KeyScheme,
): AlgoSigner {
  return signerFromSeed(algosdk.seedFromMnemonic(mnemonic.trim()), scheme);
}

/** Builds a signer from a 32-byte seed (what custodial wallets store, encrypted). */
export function signerFromSeed(
  seed: Uint8Array,
  scheme: KeyScheme,
): AlgoSigner {
  if (seed.length !== 32) throw new Error('Invalid key seed');
  if (scheme === 'ed25519') {
    const acct = algosdk.mnemonicToSecretKey(algosdk.mnemonicFromSeed(seed));
    return {
      scheme,
      address: acct.addr.toString(),
      sign: (txns) => Promise.resolve(txns.map((t) => t.signTxn(acct.sk))),
      wipe: () => acct.sk.fill(0),
    };
  }
  const pqSeed = algosdk.pq25WordMnemonicToSeed(
    algosdk.mnemonicFromSeed(seed),
    algosdk.FALCON_1024_SCHEME,
  );
  const { publicKey, privateKey } = falcon1024.generateKey(pqSeed);
  pqSeed.fill(0);
  const s = algosdk.addressWithSignersFromRawFalcon1024Signer({
    falcon1024PublicKey: publicKey,
    falcon1024Signer: (b: Uint8Array) =>
      Promise.resolve(falcon1024.signCompressed(privateKey, b)),
  });
  return {
    scheme,
    address: s.address.toString(),
    sign: (txns) =>
      s.txnSigner(
        txns,
        txns.map((_, i) => i),
      ),
    wipe: () => privateKey.fill(0),
  };
}

/** Signs a group where each txn may belong to a different signer. */
export async function signGroup(
  parts: { txn: algosdk.Transaction; signer: AlgoSigner }[],
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const p of parts) out.push(...(await p.signer.sign([p.txn])));
  return out;
}
