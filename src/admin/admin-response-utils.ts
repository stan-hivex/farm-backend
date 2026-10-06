export interface AdminListItemShape {
  id?: string;
  transaction_reference?: string;
  transaction_type?: string;
  status?: string;
  amount?: number | string | null;
  currency?: string | null;
  created_at?: Date | string | null;
  createdAt?: Date | string | null;
  processed_at?: Date | string | null;
  metadata?: Record<string, any> | null;
  method?: string;
  user_id?: string | null;
  username?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  amount_display?: string | null;
  status_display?: string | null;
  date?: string | null;
  time?: string | null;
}

type AdminListUser = {
  id?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function enrichAdminListItem<T extends Record<string, any>>(
  item: T,
  user?: AdminListUser | null,
): T & AdminListItemShape {
  const metadata = (item.metadata as Record<string, any> | undefined) ?? {};
  const relatedUser = user ?? item.user ?? null;
  const userId = (
    relatedUser?.id ??
    metadata.user_id ??
    metadata.userId ??
    item.user_id ??
    item.userId ??
    null
  )?.toString() ?? null;
  const username = (
    relatedUser?.username ??
    metadata.username ??
    item.username ??
    null
  )?.toString() ?? null;
  const userName = [
    relatedUser?.first_name ?? item.first_name,
    relatedUser?.last_name ?? item.last_name,
  ]
    .filter(Boolean)
    .join(' ') || item.user_name?.toString() || null;

  const rawMethod =
    metadata.payment_method ??
    metadata.paymentMethod ??
    metadata.method ??
    item.method ??
    item.payment_method ??
    item.paymentMethod ??
    item.payment_provider ??
    item.provider ??
    metadata.payment_provider ??
    metadata.provider ??
    null;
  const normalizedMethod = rawMethod?.toString().trim().toUpperCase() || 'UNKNOWN';

  const rawStatus = item.status?.toString().trim().toLowerCase() ?? '';
  const statusValue = rawStatus || 'unknown';

  const createdAt = item.created_at ?? item.createdAt ?? item.processed_at ?? item.processedAt ?? null;
  const dateTime = createdAt ? new Date(createdAt) : null;
  const dateValue = dateTime && !Number.isNaN(dateTime.getTime()) ? dateTime.toISOString().slice(0, 10) : null;
  const timeValue = dateTime && !Number.isNaN(dateTime.getTime()) ? dateTime.toISOString().slice(11, 19) : null;
  const amount = item.amount != null ? Number(item.amount) : null;
  const currency = item.currency?.toString().trim() || 'FARM';

  return {
    ...item,
    transaction_reference: item.transaction_reference ?? item.reference ?? null,
    created_at: item.created_at ?? item.createdAt ?? null,
    user_id: userId,
    username,
    user_name: userName,
    user_email: relatedUser?.email ?? item.user_email ?? null,
    user_phone: relatedUser?.phone ?? item.user_phone ?? null,
    method: normalizedMethod,
    amount,
    status: statusValue,
    date: dateValue,
    time: timeValue,
    amount_display: amount != null ? `${amount.toFixed(2)} ${currency}` : null,
    status_display: statusValue.toUpperCase(),
  };
}
