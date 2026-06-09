export function generateTxReference(): string {
  return `tx_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function generateEscrowReference(): string {
  return `escrow_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function generateWalletAddress(prefix = 'WAL', secret?: string): string {
  const secretPart = secret ? `_${secret.slice(0, 6).toUpperCase()}` : '';
  return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}${secretPart}_${Date.now().toString(36)}`;
}

export function generateOtp(length = 6): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

export function generateReferralCode(): string {
  return `REF_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
