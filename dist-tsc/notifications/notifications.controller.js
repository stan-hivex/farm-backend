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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const notifications_service_1 = require("./notifications.service");
const register_device_token_dto_1 = require("./dto/register-device-token.dto");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let NotificationsController = class NotificationsController {
    constructor(notificationsService) {
        this.notificationsService = notificationsService;
    }
    async getSettings(req) {
        return this.notificationsService.getSettings(req.user.id);
    }
    async updateSettings(req, body) {
        return this.notificationsService.updateSettings(req.user.id, body);
    }
    async registerDeviceToken(req, body) {
        const token = body.deviceToken || body.token;
        return this.notificationsService.registerDeviceToken(req.user.id, token || '', body.platform);
    }
    async getNotifications(req, query) {
        return this.notificationsService.getNotifications(req.user.id, query);
    }
    async markRead(req, id) {
        return this.notificationsService.markRead(req.user.id, id);
    }
    async markAllRead(req) {
        return this.notificationsService.markAllRead(req.user.id);
    }
    async deleteNotification(req, id) {
        return this.notificationsService.deleteNotification(req.user.id, id);
    }
    async deleteAllNotifications(req) {
        return this.notificationsService.deleteAllNotifications(req.user.id);
    }
    async removeDeviceToken(req, body) {
        return this.notificationsService.removeDeviceToken(req.user.id, body.token);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('notifications:read'),
    (0, common_1.Get)('settings'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getSettings", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    (0, common_1.Put)('settings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "updateSettings", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    (0, common_1.Post)(['device-token', 'register-device']),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_device_token_dto_1.RegisterDeviceTokenDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "registerDeviceToken", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('notifications:read'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markRead", null);
__decorate([
    (0, common_1.Patch)('read-all'),
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllRead", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "deleteNotification", null);
__decorate([
    (0, common_1.Delete)(),
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "deleteAllNotifications", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('notifications:write'),
    (0, common_1.Delete)('device-token'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "removeDeviceToken", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('notifications'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map