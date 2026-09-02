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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const class_validator_1 = require("class-validator");
const settings_service_1 = require("./settings.service");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class UpdateLanguageDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['en', 'es', 'fr', 'de', 'pt', 'sw']),
    __metadata("design:type", String)
], UpdateLanguageDto.prototype, "language", void 0);
class UpdateThemeDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['light', 'dark', 'auto']),
    __metadata("design:type", String)
], UpdateThemeDto.prototype, "theme", void 0);
let SettingsController = class SettingsController {
    constructor(settingsService) {
        this.settingsService = settingsService;
    }
    async updateLanguage(req, dto) {
        return this.settingsService.updateLanguage(req.user.id, dto.language);
    }
    async updateTheme(req, dto) {
        return this.settingsService.updateTheme(req.user.id, dto.theme);
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('settings:write'),
    (0, common_1.Put)('language'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateLanguageDto]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateLanguage", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('settings:write'),
    (0, common_1.Put)('theme'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateThemeDto]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateTheme", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('settings'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
//# sourceMappingURL=settings.controller.js.map