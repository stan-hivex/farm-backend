import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

export function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function hmacVerify(data: string, sig: string, secret: string): boolean {
  return hmacSign(data, secret) === sig;
}

export function encrypt(text: string, key: string): string {
  const iv = randomBytes(16);
  const keyBuf = Buffer.from(key.padEnd(32).substring(0, 32));
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encryptedText: string, key: string): string {
  const [ivHex, encHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const keyBuf = Buffer.from(key.padEnd(32).substring(0, 32));
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}