import type { transaction_status } from '@prisma/client';

export const HIDDEN_TRANSACTION_HISTORY_STATUSES: transaction_status[] = [
  'pending',
  'processing',
  'failed',
  'cancelled',
  'reversed',
];
