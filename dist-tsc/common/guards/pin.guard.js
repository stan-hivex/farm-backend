"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PinGuard = exports.RequirePin = exports.REQUIRE_PIN_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_service_1 = require("../../auth/auth.service");
exports.REQUIRE_PIN_KEY = 'requirePin';
const RequirePin = () => (0, common_1.SetMetadata)(exports.REQUIRE_PIN_KEY, true);
exports.RequirePin = RequirePin;
let PinGuard = class PinGuard {
    constructor(reflector, authService) {
        this.reflector = reflector;
        this.authService = authService;
    }
    async canActivate(context) {
        const requirePin = this.reflector.getAllAndOverride(exports.REQUIRE_PIN_KEY, [
            context.getHandler(), context.getClass(),
        ]);
        if (!requirePin)
            return true;
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const pin = request.body?.pin;
        if (!pin)
            throw new common_1.BadRequestException('PIN is required for this action');
        await this.authService.verifyPin(user.id, pin);
        return true;
    }
};
exports.PinGuard = PinGuard;
exports.PinGuard = PinGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, auth_service_1.AuthService])
], PinGuard);
//# sourceMappingURL=pin.guard.js.map