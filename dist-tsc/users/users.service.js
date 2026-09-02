"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
const pagination_util_1 = require("../common/utils/pagination.util");
const bcrypt = __importStar(require("bcrypt"));
let UsersService = class UsersService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async getProfile(userId) {
        const cacheKey = `dashboard:${userId}`;
        const cached = await this.cache.cacheGet(cacheKey);
        if (cached) {
            return cached;
        }
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true, first_name: true, last_name: true, username: true,
                email: true, phone: true, role: true, kyc_status: true, kyc_level: true,
                phone_verified: true, email_verified: true, profile_image: true,
                bio: true, country: true, city: true, referral_code: true, created_at: true,
                wallets: { select: { wallet_address: true, balance: true, currency: true } },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const payload = { data: user };
        await this.cache.cacheSet(cacheKey, payload, 60);
        return payload;
    }
    async updateProfile(userId, dto) {
        if (dto.username != null) {
            const normalized = dto.username.trim().toLowerCase();
            if (normalized.length < 3) {
                throw new common_1.BadRequestException('Username must be at least 3 characters');
            }
            const existing = await this.prisma.users.findFirst({
                where: {
                    username: normalized,
                    NOT: { id: userId },
                },
            });
            if (existing) {
                throw new common_1.ConflictException('Username taken');
            }
            dto.username = normalized;
        }
        const user = await this.prisma.users.update({
            where: { id: userId },
            data: dto,
            select: {
                id: true, first_name: true, last_name: true, username: true,
                bio: true, country: true, city: true, profile_image: true,
            },
        });
        await Promise.all([
            this.cache.cacheDelete(`dashboard:${userId}`),
            this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`),
            this.cache.cacheInvalidatePattern(`transactions:${userId}:*`),
        ]);
        return { data: user, message: 'Profile updated' };
    }
    async searchUsers(query) {
        const normalized = (query ?? '').trim().toLowerCase();
        if (!normalized || normalized.length < 2)
            return { data: [] };
        const searchTerms = normalized.split(/\s+/).filter(Boolean);
        const searchValue = searchTerms.join(' ');
        const users = await this.prisma.users.findMany({
            where: {
                is_deleted: false,
                is_active: true,
                OR: [
                    { username: { contains: searchValue, mode: 'insensitive' } },
                    { phone: { contains: searchValue } },
                    { first_name: { contains: searchValue, mode: 'insensitive' } },
                    { last_name: { contains: searchValue, mode: 'insensitive' } },
                    {
                        AND: searchTerms.slice(1).map((term) => ({
                            OR: [
                                { first_name: { contains: term, mode: 'insensitive' } },
                                { last_name: { contains: term, mode: 'insensitive' } },
                                { username: { contains: term, mode: 'insensitive' } },
                            ],
                        })),
                    },
                ],
            },
            select: {
                id: true,
                username: true,
                first_name: true,
                last_name: true,
                phone: true,
                profile_image: true,
                wallets: { select: { wallet_address: true }, take: 1 },
            },
            orderBy: [
                { username: 'asc' },
                { first_name: 'asc' },
            ],
            take: 10,
        });
        return { data: users };
    }
    async getContacts(userId) {
        const contacts = await this.prisma.contacts.findMany({
            where: { owner_id: userId },
            include: {
                users_contacts_contact_user_idTousers: {
                    select: {
                        id: true, username: true, first_name: true, last_name: true,
                        profile_image: true,
                        wallets: { select: { wallet_address: true }, take: 1 },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        return { data: contacts };
    }
    async addContact(ownerId, identifier, nickname) {
        const target = await this.prisma.users.findFirst({
            where: { OR: [{ username: identifier }, { phone: identifier }], is_deleted: false },
        });
        if (!target)
            throw new common_1.NotFoundException('User not found');
        if (target.id === ownerId)
            throw new common_1.ConflictException('Cannot add yourself as a contact');
        const exists = await this.prisma.contacts.findFirst({
            where: { owner_id: ownerId, contact_user_id: target.id },
        });
        if (exists)
            throw new common_1.ConflictException('Contact already added');
        const contact = await this.prisma.contacts.create({
            data: { owner_id: ownerId, contact_user_id: target.id, nickname },
        });
        return { data: contact, message: 'Contact added' };
    }
    async removeContact(ownerId, contactId) {
        await this.prisma.contacts.deleteMany({ where: { id: contactId, owner_id: ownerId } });
        return { message: 'Contact removed' };
    }
    async getNotifications(userId, query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const [items, total] = await Promise.all([
            this.prisma.notifications.findMany({
                where: { user_id: userId }, skip, take, orderBy: { created_at: 'desc' },
            }),
            this.prisma.notifications.count({ where: { user_id: userId } }),
        ]);
        return { data: items, meta: (0, pagination_util_1.paginate)(total, page, limit) };
    }
    async markNotificationRead(userId, notifId) {
        await this.prisma.notifications.updateMany({
            where: { id: notifId, user_id: userId }, data: { is_read: true },
        });
        return { message: 'Notification marked as read' };
    }
    async markAllNotificationsRead(userId) {
        await this.prisma.notifications.updateMany({
            where: { user_id: userId, is_read: false }, data: { is_read: true },
        });
        return { message: 'All notifications marked as read' };
    }
    async deleteNotification(userId, notifId) {
        const result = await this.prisma.notifications.deleteMany({
            where: { id: notifId, user_id: userId },
        });
        if (result.count === 0) {
            throw new common_1.NotFoundException('Notification not found');
        }
        return { message: 'Notification deleted' };
    }
    async deleteAllNotifications(userId) {
        const result = await this.prisma.notifications.deleteMany({
            where: { user_id: userId },
        });
        return { message: 'All notifications deleted', deletedCount: result.count };
    }
    async changeEmail(userId, dto) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(dto.new_email)) {
            throw new common_1.BadRequestException('Invalid email format');
        }
        const existingUser = await this.prisma.users.findFirst({
            where: { email: dto.new_email, is_deleted: false },
        });
        if (existingUser && existingUser.id !== userId) {
            throw new common_1.ConflictException('Email already in use');
        }
        const user = await this.prisma.users.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const passwordMatches = await bcrypt.compare(dto.current_password, user.password_hash);
        if (!passwordMatches) {
            throw new common_1.BadRequestException('Incorrect current password');
        }
        const updated = await this.prisma.users.update({
            where: { id: userId },
            data: { email: dto.new_email, email_verified: false },
            select: { id: true, email: true, email_verified: true },
        });
        return { data: updated, message: 'Email updated successfully. Please verify your new email.' };
    }
    async changePhone(userId, dto) {
        const phoneRegex = /^[\d+\-() ]{7,20}$/;
        if (!phoneRegex.test(dto.new_phone)) {
            throw new common_1.BadRequestException('Invalid phone number format');
        }
        const existingUser = await this.prisma.users.findFirst({
            where: { phone: dto.new_phone, is_deleted: false },
        });
        if (existingUser && existingUser.id !== userId) {
            throw new common_1.ConflictException('Phone number already in use');
        }
        const user = await this.prisma.users.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const passwordMatches = await bcrypt.compare(dto.current_password, user.password_hash);
        if (!passwordMatches) {
            throw new common_1.BadRequestException('Incorrect current password');
        }
        const updated = await this.prisma.users.update({
            where: { id: userId },
            data: { phone: dto.new_phone, phone_verified: false },
            select: { id: true, phone: true, phone_verified: true },
        });
        return { data: updated, message: 'Phone number updated successfully. Please verify your new phone.' };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], UsersService);
//# sourceMappingURL=users.service.js.map