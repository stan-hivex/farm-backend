import { BusinessPermission } from '../business-ops/permissions';

/** Per-key scopes for the FARM developer API. */
export const API_SCOPES = [
  'account:read',
  'transactions:read',
  'payments:read',
  'payment_links:read',
  'payment_links:write',
  'invoices:read',
  'invoices:write',
  'escrow:read',
  'escrow:write',
  'payouts:read',
  'payouts:write',
  'projects:read',
  'payment_intents:read',
  'payment_intents:write',
  'refunds:write',
  'agent_payments:read',
  'agent_payments:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Read-only scopes given to a key when none are chosen. */
export const DEFAULT_SCOPES: ApiScope[] = API_SCOPES.filter((s) =>
  s.endsWith(':read'),
) as ApiScope[];

/**
 * A key can never do more than the person who created it. Each scope maps to
 * the business-role permission the creator must hold to grant it.
 */
export const SCOPE_REQUIRES: Record<ApiScope, BusinessPermission> = {
  'account:read': 'profile:read',
  'transactions:read': 'transactions:read',
  'payments:read': 'transactions:read',
  'payment_links:read': 'links:read',
  'payment_links:write': 'links:manage',
  'invoices:read': 'invoices:read',
  'invoices:write': 'invoices:manage',
  'escrow:read': 'escrow:read',
  'escrow:write': 'escrow:manage',
  'payouts:read': 'payouts:read',
  'payouts:write': 'payouts:create',
  'projects:read': 'projects:read',
  'payment_intents:read': 'links:read',
  'payment_intents:write': 'links:manage',
  'refunds:write': 'payouts:create',
  'agent_payments:read': 'links:read',
  'agent_payments:write': 'links:manage',
};

export const KEY_PREFIX = { sandbox: 'farm_sk_test_', live: 'farm_sk_live_' };

export function modeOfKey(raw: string): 'sandbox' | 'live' | null {
  if (raw.startsWith(KEY_PREFIX.sandbox)) return 'sandbox';
  if (raw.startsWith(KEY_PREFIX.live)) return 'live';
  return null;
}
