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
exports.TransferRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const transfer_requests_service_1 = require("./transfer-requests.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const ownership_decorator_1 = require("../common/decorators/ownership.decorator");
class RequestFundsDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RequestFundsDto.prototype, "sender_identifier", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], RequestFundsDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RequestFundsDto.prototype, "description", void 0);
class AcceptTransferDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AcceptTransferDto.prototype, "request_id", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(4, 6),
    __metadata("design:type", String)
], AcceptTransferDto.prototype, "pin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], AcceptTransferDto.prototype, "biometric_auth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AcceptTransferDto.prototype, "device_fingerprint", void 0);
let TransferRequestsController = class TransferRequestsController {
    constructor(svc) {
        this.svc = svc;
    }
    requestFunds(u, dto, req) {
        return this.svc.requestFunds(u.id, dto, req.ip || '');
    }
    getPendingRequests(u, q) {
        return this.svc.getPendingRequests(u.id, q);
    }
    acceptAndTransfer(u, dto, req) {
        return this.svc.acceptAndTransfer(u.id, dto, req.ip || '');
    }
    rejectRequest(u, id) {
        return this.svc.rejectRequest(u.id, id);
    }
    cancelRequest(u, id) {
        return this.svc.cancelRequest(u.id, id);
    }
    getRequestDetails(u, id) {
        return this.svc.getRequestDetails(u.id, id);
    }
    getMyRequestHistory(u, q) {
        return this.svc.getMyRequestHistory(u.id, q);
    }
};
exports.TransferRequestsController = TransferRequestsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('request'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Request funds from another user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, RequestFundsDto, Object]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "requestFunds", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, common_1.Get)('pending'),
    (0, swagger_1.ApiOperation)({ summary: 'Get pending transfer requests for me (as sender)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "getPendingRequests", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('accept'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Accept and complete a transfer request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AcceptTransferDto, Object]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "acceptAndTransfer", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, ownership_decorator_1.RequireOwnership)('id'),
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: 'Reject a transfer request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "rejectRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, ownership_decorator_1.RequireOwnership)('id'),
    (0, common_1.Post)(':id/cancel'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a transfer request I created' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "cancelRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, ownership_decorator_1.RequireOwnership)('id'),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get transfer request details' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "getRequestDetails", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all my transfer requests (sent and received)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TransferRequestsController.prototype, "getMyRequestHistory", null);
exports.TransferRequestsController = TransferRequestsController = __decorate([
    (0, swagger_1.ApiTags)('Transfer Requests'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)({ path: 'transfer-requests', version: '1' }),
    __metadata("design:paramtypes", [transfer_requests_service_1.TransferRequestsService])
], TransferRequestsController);
//# sourceMappingURL=transfer-requests.controller.js.map