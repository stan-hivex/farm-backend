"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireOwnership = exports.OWNERSHIP_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.OWNERSHIP_KEY = 'ownership';
const RequireOwnership = (config) => {
    const normalized = typeof config === 'string'
        ? { param: config, source: 'params', userProperty: 'id', allowAdmin: true }
        : {
            param: config.param ?? 'id',
            source: config.source ?? 'params',
            userProperty: config.userProperty ?? 'id',
            allowAdmin: config.allowAdmin ?? true,
        };
    return (0, common_1.SetMetadata)(exports.OWNERSHIP_KEY, normalized);
};
exports.RequireOwnership = RequireOwnership;
//# sourceMappingURL=ownership.decorator.js.map