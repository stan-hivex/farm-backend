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
exports.PaymentRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const create_payment_request_dto_1 = require("./dto/create-payment-request.dto");
const accept_payment_request_dto_1 = require("./dto/accept-payment-request.dto");
const accept_payment_requests_batch_dto_1 = require("./dto/accept-payment-requests-batch.dto");
const payment_requests_service_1 = require("./payment-requests.service");
let PaymentRequestsController = class PaymentRequestsController {
    constructor(svc) {
        this.svc = svc;
    }
    requestPayment(u, dto, req) {
        return this.svc.createRequest(u.id, dto, req.ip || '');
    }
    getPendingRequests(u, q) {
        return this.svc.getPendingRequests(u.id, q);
    }
    acceptAndTransfer(u, dto, req) {
        return this.svc.acceptAndTransfer(u.id, dto, req.ip || '');
    }
    acceptAndTransferBatch(u, dto, req) {
        return this.svc.acceptAndTransferBatch(u.id, dto, req.ip || '');
    }
    approveRequest(u, dto, req) {
        return this.svc.acceptAndTransfer(u.id, dto, req.ip || '');
    }
    declineRequest(u, id) {
        return this.svc.rejectRequest(u.id, id);
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
exports.PaymentRequestsController = PaymentRequestsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('request'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Request payment from another user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_payment_request_dto_1.CreatePaymentRequestDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "requestPayment", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, common_1.Get)('pending'),
    (0, swagger_1.ApiOperation)({ summary: 'Get pending payment requests for me (as recipient)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "getPendingRequests", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('accept'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Accept and complete a payment request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, accept_payment_request_dto_1.AcceptPaymentRequestDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "acceptAndTransfer", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('accept-batch'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Accept and complete multiple payment requests with one authorization' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, accept_payment_requests_batch_dto_1.AcceptPaymentRequestsBatchDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "acceptAndTransferBatch", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)('approve'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Approve a money request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, accept_payment_request_dto_1.AcceptPaymentRequestDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "approveRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)(':id/decline'),
    (0, swagger_1.ApiOperation)({ summary: 'Decline a payment request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "declineRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: 'Reject a payment request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "rejectRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:write'),
    (0, common_1.Post)(':id/cancel'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a payment request I created' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "cancelRequest", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get payment request details' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "getRequestDetails", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('transfer:read'),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all my payment requests (sent and received)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentRequestsController.prototype, "getMyRequestHistory", null);
exports.PaymentRequestsController = PaymentRequestsController = __decorate([
    (0, swagger_1.ApiTags)('Payment Requests'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Controller)({ path: 'payment-requests', version: '1' }),
    __metadata("design:paramtypes", [payment_requests_service_1.PaymentRequestsService])
], PaymentRequestsController);
//# sourceMappingURL=payment-requests.controller.js.map