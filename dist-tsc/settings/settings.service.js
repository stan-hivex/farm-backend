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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
let SettingsService = class SettingsService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async updateLanguage(userId, language) {
        await this.prisma.user_settings.upsert({
            where: {
                user_id: userId,
            },
            update: {
                language,
            },
            create: {
                user_id: userId,
                language,
            },
        });
        await this.cache.cacheDelete(`user-settings:${userId}`);
        return {
            success: true,
            message: 'Language updated successfully',
        };
    }
    async updateTheme(userId, theme) {
        const val = (theme || '').toLowerCase();
        const allowed = ['light', 'dark', 'system'];
        const themeValue = allowed.includes(val) ? val : 'system';
        await this.prisma.user_settings.upsert({
            where: { user_id: userId },
            update: { theme: themeValue },
            create: { user_id: userId, theme: themeValue },
        });
        await this.cache.cacheDelete(`user-settings:${userId}`);
        return {
            success: true,
            message: 'Theme updated successfully',
        };
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map