import * as crypto from 'crypto';

export function verifyPaystackSignature(rawBody: string, signature: string, secret: string) {
  const hash = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  return hash === signature;
}
