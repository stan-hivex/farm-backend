"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginate = paginate;
exports.paginationParams = paginationParams;
function paginate(total, page, limit) {
    const last_page = Math.ceil(total / limit) || 1;
    return { total, page, limit, last_page, has_next: page < last_page, has_prev: page > 1 };
}
function paginationParams(page, limit) {
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
    return { skip: (p - 1) * l, take: l, page: p, limit: l };
}
//# sourceMappingURL=pagination.util.js.map