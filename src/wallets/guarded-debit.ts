import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type RawTx = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

function amountOf(amount: Prisma.Decimal | number | string) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('Amount must be greater than zero');
  }
  return amount;
}

function assertOne(debited: unknown, message = 'Insufficient balance') {
  if (Number(debited) !== 1) throw new BadRequestException(message);
}

/** Spend available funds (balance - locked). Concurrent spends fail closed. */
export async function debitAvailable(
  tx: RawTx,
  walletId: string,
  amount: Prisma.Decimal | number | string,
) {
  const value = amountOf(amount);
  const debited = await tx.$executeRaw`
    UPDATE wallets
       SET balance = COALESCE(balance, 0) - ${value}::numeric
     WHERE id = ${walletId}::uuid
       AND COALESCE(balance, 0) - COALESCE(locked_balance, 0) >= ${value}::numeric
       AND COALESCE(is_frozen, false) = false`;
  assertOne(debited);
}

/** Finish a withdrawal: drop balance and the locked portion together. */
export async function settleWithdrawal(
  tx: RawTx,
  walletId: string,
  balanceAmount: Prisma.Decimal | number | string,
  lockedAmount: Prisma.Decimal | number | string,
) {
  const balance = Number(balanceAmount);
  const locked = Number(lockedAmount);
  if (
    !Number.isFinite(balance) ||
    balance <= 0 ||
    !Number.isFinite(locked) ||
    locked < 0
  ) {
    throw new BadRequestException('Amount must be greater than zero');
  }
  const debited = await tx.$executeRaw`
    UPDATE wallets
       SET balance = COALESCE(balance, 0) - ${balanceAmount}::numeric,
           locked_balance = COALESCE(locked_balance, 0) - ${lockedAmount}::numeric
     WHERE id = ${walletId}::uuid
       AND COALESCE(balance, 0) >= ${balanceAmount}::numeric
       AND COALESCE(locked_balance, 0) >= ${lockedAmount}::numeric`;
  assertOne(debited);
}

/** Release locked escrow funds: both balance and locked must cover the amount. */
export async function debitLocked(
  tx: RawTx,
  walletId: string,
  amount: Prisma.Decimal | number | string,
) {
  const value = amountOf(amount);
  const debited = await tx.$executeRaw`
    UPDATE wallets
       SET balance = COALESCE(balance, 0) - ${value}::numeric,
           locked_balance = COALESCE(locked_balance, 0) - ${value}::numeric
     WHERE id = ${walletId}::uuid
       AND COALESCE(balance, 0) >= ${value}::numeric
       AND COALESCE(locked_balance, 0) >= ${value}::numeric`;
  assertOne(debited);
}

/** Return locked funds to available balance without changing balance. */
export async function unlockFunds(
  tx: RawTx,
  walletId: string,
  amount: Prisma.Decimal | number | string,
) {
  const value = amountOf(amount);
  const debited = await tx.$executeRaw`
    UPDATE wallets
       SET locked_balance = COALESCE(locked_balance, 0) - ${value}::numeric
     WHERE id = ${walletId}::uuid
       AND COALESCE(locked_balance, 0) >= ${value}::numeric`;
  assertOne(debited, 'Escrow lock could not be released');
}

/**
 * Lock `lockAmount` and charge `fee` from available balance in one update.
 * Available must cover fee + lockAmount.
 */
export async function lockWithFee(
  tx: RawTx,
  walletId: string,
  fee: Prisma.Decimal | number | string,
  lockAmount: Prisma.Decimal | number | string,
) {
  const feeN = Number(fee);
  const lockN = Number(lockAmount);
  if (
    !Number.isFinite(feeN) ||
    feeN < 0 ||
    !Number.isFinite(lockN) ||
    lockN <= 0
  ) {
    throw new BadRequestException('Amount must be greater than zero');
  }
  const need = feeN + lockN;
  const debited = await tx.$executeRaw`
    UPDATE wallets
       SET balance = COALESCE(balance, 0) - ${fee}::numeric,
           locked_balance = COALESCE(locked_balance, 0) + ${lockAmount}::numeric
     WHERE id = ${walletId}::uuid
       AND COALESCE(balance, 0) - COALESCE(locked_balance, 0) >= ${need}::numeric
       AND COALESCE(is_frozen, false) = false`;
  assertOne(debited);
}
