"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = void 0;
const common_1 = require("@nestjs/common");
const authenticateUser = (req, res, next) => {
    if (!req.user) {
        throw new common_1.UnauthorizedException('No authorization token provided');
    }
    next();
};
exports.authenticateUser = authenticateUser;
//# sourceMappingURL=auth.js.map