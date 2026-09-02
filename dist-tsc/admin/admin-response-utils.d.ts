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
export declare function enrichAdminListItem<T extends Record<string, any>>(item: T, user?: {
    id?: string | null;
    username?: string | null;
} | null): T & AdminListItemShape;
