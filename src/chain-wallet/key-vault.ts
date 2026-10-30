import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

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
  );
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(row.enc_tag, 'base64'));
  return new Uint8Array(
    Buffer.concat([d.update(Buffer.from(row.enc_secret, 'base64')), d.final()]),
  );
}
