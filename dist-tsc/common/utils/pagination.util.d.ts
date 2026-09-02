export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    last_page: number;
    has_next: boolean;
    has_prev: boolean;
}
export declare function paginate(total: number, page: number, limit: number): PaginationMeta;
export declare function paginationParams(page: any, limit: any): {
    skip: number;
    take: number;
    page: number;
    limit: number;
};
