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
exports.IvorypayController = void 0;
const common_1 = require("@nestjs/common");
const webhook_service_1 = require("../webhook/webhook.service");
const webhook_signature_guard_1 = require("../common/guards/webhook-signature.guard");
let IvorypayController = class IvorypayController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    async webhook(body) {
        return this.webhookService.handleIvorypayWebhook(body, true);
    }
};
exports.IvorypayController = IvorypayController;
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IvorypayController.prototype, "webhook", null);
exports.IvorypayController = IvorypayController = __decorate([
    (0, common_1.Controller)({
        path: 'ivorypay',
        version: '1',
    }),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], IvorypayController);
//# sourceMappingURL=ivorypay.controller.js.map