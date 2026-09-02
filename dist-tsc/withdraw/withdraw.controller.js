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
exports.WithdrawController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const ownership_decorator_1 = require("../common/decorators/ownership.decorator");
const withdraw_service_1 = require("./withdraw.service");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const create_withdraw_dto_1 = require("./dto/create-withdraw.dto");
const transfer_withdraw_dto_1 = require("./dto/transfer-withdraw.dto");
let WithdrawController = class WithdrawController {
    constructor(withdrawService) {
        this.withdrawService = withdrawService;
    }
    async create(req, dto) {
        return this.withdrawService.createWithdrawal(req.user.id, dto);
    }
    async transfer(req, dto) {
        const createDto = {
            amount: dto.amount,
            method: 'MOBILE_MONEY',
            phoneNumber: dto.phoneNumber,
            accountName: dto.accountName,
            pin: dto.pin,
        };
        return this.withdrawService.createWithdrawal(req.user.id, createDto);
    }
    async history(req) {
        return this.withdrawService.getUserWithdrawals(req.user.id);
    }
    async getStatus(req, reference) {
        const status = await this.withdrawService.getWithdrawalStatus(reference, req.user.id);
        if (!status) {
            return { success: false, message: 'Withdrawal not found' };
        }
        return { success: true, status };
    }
    async getCryptoNetworks(req, token) {
        return this.withdrawService.getProviderNetworks(token);
    }
    async getOne(id, req) {
        return this.withdrawService.getWithdrawal(id, req.user?.id);
    }
};
exports.WithdrawController = WithdrawController;
__decorate([
    (0, permissions_decorator_1.Permissions)('withdraw:write'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, kyc_guard_1.KycGuard),
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
    __metadata("design:paramtypes", [Object, create_withdraw_dto_1.CreateWithdrawDto]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "create", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('withdraw:write'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, kyc_guard_1.KycGuard),
    (0, throttler_1.Throttle)({
        default: {
            limit: 10,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('transfer'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, transfer_withdraw_dto_1.TransferWithdrawDto]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "transfer", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('withdraw:read'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "history", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('status/:reference'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "getStatus", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('withdraw:read'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('crypto/networks'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "getCryptoNetworks", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('withdraw:read'),
    (0, ownership_decorator_1.RequireOwnership)('id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WithdrawController.prototype, "getOne", null);
exports.WithdrawController = WithdrawController = __decorate([
    (0, common_1.Controller)({
        path: 'withdraw',
        version: '1',
    }),
    __metadata("design:paramtypes", [withdraw_service_1.WithdrawService])
], WithdrawController);
//# sourceMappingURL=withdraw.controller.js.map