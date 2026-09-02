"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertResourceAccess = assertResourceAccess;
const common_1 = require("@nestjs/common");
function assertResourceAccess(ownerId, currentUserId, resourceName = 'resource') {
    if (!currentUserId) {
        throw new common_1.UnauthorizedException('Authentication required');
    }
    if (!ownerId || ownerId !== currentUserId) {
        throw new common_1.ForbiddenException(`You do not have permission to access this ${resourceName}`);
    }
}
//# sourceMappingURL=access-control.util.js.map