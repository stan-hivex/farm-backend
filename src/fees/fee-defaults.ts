/** Default fee schedule (percent). DB rows in fee_configurations override these; FEE_<KEY>_PCT env overrides the defaults. */
export const FEE_KEYS = [
  'escrow_creation',
  'escrow_release',
  'withdrawal',
  'investment',
  'travel_commission',
  'merchant',
  'transfer',
  'project_listing',
  'received_chain',
  'agent_payment',
] as const;
export type FeeKey = (typeof FEE_KEYS)[number];

export const FEE_DEFAULTS: Record<FeeKey, number> = {
  escrow_creation: 1.5,
  escrow_release: 1.5,
  withdrawal: 1.5,
  investment: 3,
  travel_commission: 5,
  merchant: 1,
  transfer: 0,
  project_listing: 15,
  received_chain: 0,
  agent_payment: 0,
};

/** Code default, overridable with FEE_<KEY>_PCT (0-100). */
export function defaultPercent(key: FeeKey): {
  v: number;
  src: 'env' | 'default';
} {
  const raw = process.env[`FEE_${key.toUpperCase()}_PCT`];
  const n = raw == null || raw === '' ? NaN : Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 100) return { v: n, src: 'env' };
  return { v: FEE_DEFAULTS[key], src: 'default' };
}

export interface FeeRule {
  key: FeeKey;
  percent: number;
  flat: number;
  min: number;
  max: number; // 0 = no cap
  source: 'db' | 'env' | 'default';
  label?: string | null;
  payer?: string | null;
  destination_wallet_id?: string | null;
}

/** Pure fee maths: percent of amount + flat, floored at min, capped at max (0 = no cap), rounded to dp. */
export function computeFee(rule: FeeRule, amount: number, dp = 2): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  let fee = (amount * rule.percent) / 100 + rule.flat;
  if (rule.min > 0) fee = Math.max(rule.min, fee);
  if (rule.max > 0) fee = Math.min(rule.max, fee);
  const f = 10 ** dp;
  return Math.max(0, Math.round((fee + Number.EPSILON) * f) / f);
}

/** Fee via FeesService when injected, otherwise the code default (keeps unit tests/legacy wiring working). */
export async function feeFor(
  fees:
    | { fee(key: FeeKey, amount: number, dp?: number): Promise<number> }
    | undefined
    | null,
  key: FeeKey,
  amount: number,
  dp = 2,
): Promise<number> {
  if (fees) return fees.fee(key, amount, dp);
  const d = defaultPercent(key);
  return computeFee(
    { key, percent: d.v, flat: 0, min: 0, max: 0, source: d.src },
    amount,
    dp,
  );
}

/** Rule via FeesService when injected, otherwise the code default. */
export async function ruleFor(
  fees: { rule(key: FeeKey): Promise<FeeRule> } | undefined | null,
  key: FeeKey,
): Promise<FeeRule> {
  if (fees) return fees.rule(key);
  const d = defaultPercent(key);
  return { key, percent: d.v, flat: 0, min: 0, max: 0, source: d.src };
}

/** Credit a fee to the platform (super-admin) wallet inside a DB transaction, with a ledger entry. */
export async function creditPlatformInTx(
  tx: any,
  amount: number,
  description: string,
  transactionId?: string,
  category?: string,
) {
  if (!(amount > 0)) return;
  const admin = await tx.users.findFirst({
    where: { role: 'super_admin', is_deleted: false },
    include: { wallets: { where: { is_active: true }, take: 1 } },
  });
  const w = admin?.wallets?.[0];
  if (!w) throw new Error('Platform fee wallet not found');
  await creditWalletInTx(
    tx,
    w.id,
    amount,
    description,
    transactionId,
    category,
  );
}

export async function creditWalletInTx(
  tx: any,
  walletId: string,
  amount: number,
  description: string,
  transactionId?: string,
  category?: string,
) {
  if (!(amount > 0)) return;
  const before = await tx.wallets.findUnique({ where: { id: walletId } });
  if (!before) throw new Error('Fee wallet not found');
  await tx.wallets.update({
    where: { id: walletId },
    data: { balance: { increment: amount } },
  });
  await tx.ledger_entries.create({
    data: {
      transaction_id: transactionId ?? null,
      wallet_id: walletId,
      entry_type: 'credit',
      amount,
      balance_before: Number(before.balance ?? 0),
      balance_after: Number(before.balance ?? 0) + amount,
      description,
      ...(category ? { category } : {}),
    },
  });
}
