"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireTurnstile = RequireTurnstile;
const common_1 = require("@nestjs/common");
const turnstile_guard_1 = require("../guards/turnstile.guard");
function RequireTurnstile() {
    return (0, common_1.UseGuards)(turnstile_guard_1.TurnstileGuard);
}
//# sourceMappingURL=require-turnstile.decorator.js.map