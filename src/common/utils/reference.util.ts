import { randomBytes } from 'crypto';

export function generateTxReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(4).toString('hex').toUpperCase();
  return `TXN-${date}-${rand}`;
}

export function generateEscrowReference(): string {
  const rand = randomBytes(5).toString('hex').toUpperCase();
  return `ESC-${Date.now()}-${rand}`;
}

export function generateOtp(length = 6): string {
  const max = Math.pow(10, length);
  return Math.floor(Math.random() * max).toString().padStart(length, '0');
}

export function generateWalletAddress(userId: string, secret: string): string {
  const hash = require('crypto')
    .createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .substring(0, 14)
    .toUpperCase();
  return `FARM${hash}`;
}

export function generateReferralCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}