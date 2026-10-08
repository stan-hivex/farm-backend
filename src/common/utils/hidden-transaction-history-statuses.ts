import type { transaction_status } from '@prisma/client';

export const HIDDEN_TRANSACTION_HISTORY_STATUSES: transaction_status[] = [
  'failed',
  'cancelled',
  'reversed',
];
