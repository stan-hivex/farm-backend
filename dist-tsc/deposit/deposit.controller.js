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
exports.DepositController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const throttler_1 = require("@nestjs/throttler");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const ownership_decorator_1 = require("../common/decorators/ownership.decorator");
const deposit_service_1 = require("./deposit.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
class CreateDepositDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateDepositDto.prototype, "amount_fiat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "payment_method", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "method", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "payment_channel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "payment_provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDepositDto.prototype, "email", void 0);
let DepositController = class DepositController {
    constructor(depositService) {
        this.depositService = depositService;
    }
    async create(req, dto) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.depositService.createDeposit(userId, dto);
    }
    async history(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.depositService.getUserDeposits(userId);
    }
    async wallet(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.depositService.getWalletBalance(userId);
    }
    async getOne(id, req) {
        const userId = req.user?.id;
        return this.depositService.getDepositById(id, userId);
    }
};
exports.DepositController = DepositController;
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:write'),
    (0, throttler_1.Throttle)({
        default: {
            limit: 10,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateDepositDto]),
    __metadata("design:returntype", Promise)
], DepositController.prototype, "create", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DepositController.prototype, "history", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, common_1.Get)('wallet'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DepositController.prototype, "wallet", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, ownership_decorator_1.RequireOwnership)('id'),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DepositController.prototype, "getOne", null);
exports.DepositController = DepositController = __decorate([
    (0, common_1.Controller)({ path: 'deposit', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [deposit_service_1.DepositService])
], DepositController);
//# sourceMappingURL=deposit.controller.js.map