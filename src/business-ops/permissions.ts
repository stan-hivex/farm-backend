export const BUSINESS_ROLES = [
  'owner',
  'admin',
  'finance',
  'accountant',
  'operations',
  'developer',
] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export type BusinessPermission =
  | 'dashboard:read'
  | 'wallet:read'
  | 'team:read'
  | 'team:manage'
  | 'transactions:read'
  | 'customers:read'
  | 'customers:manage'
  | 'invoices:read'
  | 'invoices:manage'
  | 'links:read'
  | 'links:manage'
  | 'payouts:read'
  | 'payouts:create'
  | 'escrow:read'
  | 'escrow:manage'
  | 'analytics:read'
  | 'profile:read'
  | 'profile:manage';

const ALL: BusinessRole[] = [...BUSINESS_ROLES];

/** Single source of truth for role -> permission checks (enforced server-side). */
export const PERMISSION_MATRIX: Record<BusinessPermission, BusinessRole[]> = {
  'dashboard:read': ALL,
  'wallet:read': ['owner', 'admin', 'finance', 'accountant'],
  'team:read': ALL,
  'team:manage': ['owner', 'admin'],
  'transactions:read': [
    'owner',
    'admin',
    'finance',
    'accountant',
    'operations',
  ],
  'customers:read': ['owner', 'admin', 'finance', 'accountant', 'operations'],
  'customers:manage': ['owner', 'admin', 'finance', 'operations'],
  'invoices:read': ['owner', 'admin', 'finance', 'accountant', 'operations'],
  'invoices:manage': ['owner', 'admin', 'finance'],
  'links:read': ALL,
  'links:manage': ['owner', 'admin', 'finance', 'operations'],
  'payouts:read': ['owner', 'admin', 'finance', 'accountant'],
  'payouts:create': ['owner', 'finance'],
  'escrow:read': ['owner', 'admin', 'finance', 'operations'],
  'escrow:manage': ['owner', 'admin', 'operations'],
  'analytics:read': ['owner', 'admin', 'finance', 'accountant'],
  'profile:read': ALL,
  'profile:manage': ['owner', 'admin'],
};

export function can(role: BusinessRole, perm: BusinessPermission): boolean {
  return PERMISSION_MATRIX[perm].includes(role);
}

export function permissionsFor(role: BusinessRole): BusinessPermission[] {
  return (Object.keys(PERMISSION_MATRIX) as BusinessPermission[]).filter((p) =>
    can(role, p),
  );
}

/** Roles an actor may assign. Only the owner can create admins. */
export function assignableRoles(actor: BusinessRole): BusinessRole[] {
  if (actor === 'owner')
    return ['admin', 'finance', 'accountant', 'operations', 'developer'];
  if (actor === 'admin')
    return ['finance', 'accountant', 'operations', 'developer'];
  return [];
}
