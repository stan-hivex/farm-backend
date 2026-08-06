export interface AdminListItemShape {
  id?: string;
  transaction_reference?: string;
  transaction_type?: string;
  status?: string;
  amount?: number | string | null;
  created_at?: Date | string | null;
  processed_at?: Date | string | null;
  metadata?: Record<string, any> | null;
  method?: string;
  user_id?: string | null;
  username?: string | null;
  amount_display?: string | null;
  status_display?: string | null;
  date?: string | null;
  time?: string | null;
}

export function enrichAdminListItem<T extends Record<string, any>>(item: T, user?: { id?: string | null; username?: string | null } | null): T & AdminListItemShape {
  const metadata = (item.metadata as Record<string, any> | undefined) ?? {};
  const userId = (user?.id ?? metadata.user_id ?? item.user_id ?? item.userId ?? null)?.toString() ?? null;
  const username = (user?.username ?? metadata.username ?? item.username ?? item.user_name ?? null)?.toString() ?? null;

  const rawMethod = metadata.payment_method ?? metadata.method ?? item.method ?? item.payment_method ?? item.paymentMethod ?? item.provider ?? null;
  const normalizedMethod = rawMethod?.toString().trim().toUpperCase() || 'UNKNOWN';

  const rawStatus = item.status?.toString().trim().toLowerCase() ?? '';
  const statusValue = rawStatus || 'unknown';

  const createdAt = item.created_at ?? item.createdAt ?? item.processed_at ?? item.processedAt ?? null;
  const dateTime = createdAt ? new Date(createdAt) : null;
  const dateValue = dateTime && !Number.isNaN(dateTime.getTime()) ? dateTime.toISOString().slice(0, 10) : null;
  const timeValue = dateTime && !Number.isNaN(dateTime.getTime()) ? dateTime.toISOString().slice(11, 19) : null;

  return {
    ...item,
    user_id: userId,
    username,
    method: normalizedMethod,
    amount: item.amount != null ? Number(item.amount) : null,
    status: statusValue,
    date: dateValue,
    time: timeValue,
    amount_display: item.amount != null ? `${Number(item.amount).toFixed(2)} FARM` : null,
    status_display: statusValue.toUpperCase(),
  };
}
