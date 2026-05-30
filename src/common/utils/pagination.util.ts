export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  last_page: number;
  has_next: boolean;
  has_prev: boolean;
}

export function paginate(total: number, page: number, limit: number): PaginationMeta {
  const last_page = Math.ceil(total / limit) || 1;
  return { total, page, limit, last_page, has_next: page < last_page, has_prev: page > 1 };
}

export function paginationParams(page: any, limit: any) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}