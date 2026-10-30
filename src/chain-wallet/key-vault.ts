import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AlgoSigner, KeyScheme, signerFromSeed } from './signer';

/** AES-256-GCM envelope for custodial secret keys. Master key only from env. */
function masterKey(env = process.env): Buffer {
  const k = Buffer.from(env.WALLET_KEY_ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32)
    throw new Error('Wallet encryption key is not configured');
  return k;
}

export function sealSecret(secret: Uint8Array, aad: string, env = process.env) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(env), iv);
  c.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([c.update(Buffer.from(secret)), c.final()]);
  return {
    enc_secret: enc.toString('base64'),
    enc_iv: iv.toString('base64'),
    enc_tag: c.getAuthTag().toString('base64'),
  };
}

/** Bound to the address via AAD, so a sealed key cannot be swapped between rows. */
export function openSecret(
  row: { enc_secret: string; enc_iv: string; enc_tag: string },
  aad: string,
  env = process.env,
): Uint8Array {
  const d = createDecipheriv(
    'aes-256-gcm',
    masterKey(env),
    Buffer.from(row.enc_iv, 'base64'),
    { authTagLength: 16 },
  );
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(row.enc_tag, 'base64'));
  return new Uint8Array(
    Buffer.concat([d.update(Buffer.from(row.enc_secret, 'base64')), d.final()]),
  );
}

/**
 * Opens a custodial wallet row as a signer. Rows created before Falcon support
 * (key_scheme 'ed25519') hold the 64-byte ed25519 secret key (seed||pk); new
 * rows hold only the 32-byte seed. The derived address must match the row.
 */
export function walletSigner(
  row: {
    address: string;
    enc_secret: string;
    enc_iv: string;
    enc_tag: string;
    key_scheme?: string | null;
  },
  env = process.env,
): AlgoSigner {
  const raw = openSecret(row, row.address, env);
  const scheme: KeyScheme =
    row.key_scheme === 'falcon1024' ? 'falcon1024' : 'ed25519';
  const seed = raw.length === 64 ? raw.slice(0, 32) : raw;
  try {
    const s = signerFromSeed(seed, scheme);
    if (s.address !== row.address) {
      s.wipe();
      throw new Error('Custodial key does not match its address');
    }
    return s;
  } finally {
    raw.fill(0);
    seed.fill(0);
  }
}
