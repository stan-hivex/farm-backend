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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const webhook_signature_guard_1 = require("../common/guards/webhook-signature.guard");
const ivorypay_deposit_service_1 = require("./ivorypay-deposit.service");
let CryptoController = class CryptoController {
    constructor(ivorypayDepositService) {
        this.ivorypayDepositService = ivorypayDepositService;
    }
    async deposit(req, dto) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.ivorypayDepositService.createDeposit(userId, dto);
    }
    async status(reference) {
        return this.ivorypayDepositService.getStatus(reference);
    }
    async webhook(body) {
        return this.ivorypayDepositService.handleWebhook(body, true);
    }
};
exports.CryptoController = CryptoController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, permissions_decorator_1.Permissions)('payments:write'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('deposit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoController.prototype, "deposit", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, common_1.Get)('status/:reference'),
    __param(0, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CryptoController.prototype, "status", null);
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CryptoController.prototype, "webhook", null);
exports.CryptoController = CryptoController = __decorate([
    (0, common_1.Controller)({ path: 'crypto', version: '1' }),
    __metadata("design:paramtypes", [ivorypay_deposit_service_1.IvorypayDepositService])
], CryptoController);
//# sourceMappingURL=crypto.controller.js.map