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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const config_1 = require("@nestjs/config");
const pagination_util_1 = require("../common/utils/pagination.util");
const nodemailer = __importStar(require("nodemailer"));
const twilio_1 = __importDefault(require("twilio"));
const firebase_service_1 = require("./firebase.service");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(prisma, cfg, firebase) {
        this.prisma = prisma;
        this.cfg = cfg;
        this.firebase = firebase;
        this.logger = new common_1.Logger(NotificationsService_1.name);
        this.mailer = nodemailer.createTransport({
            host: cfg.get('SMTP_HOST'),
            port: cfg.get('SMTP_PORT', 587),
            auth: { user: cfg.get('SMTP_USER'), pass: cfg.get('SMTP_PASS') },
        });
        const sid = cfg.get('TWILIO_ACCOUNT_SID');
        const token = cfg.get('TWILIO_AUTH_TOKEN');
        if (sid && token) {
            try {
                this.twilioClient = (0, twilio_1.default)(sid, token);
                this.logger.log('Twilio SMS client initialized');
            }
            catch (e) {
                this.logger.error('Failed to initialize Twilio client: ' + e);
            }
        }
        if (this.firebase) {
            this.logger.log('FirebaseService provided for FCM');
        }
    }
    async getDeviceTokens(userId) {
        const tokens = await this.prisma.device_tokens.findMany({ where: { user_id: userId, is_active: true } });
        return tokens.map((t) => t.token);
    }
    async registerDeviceToken(userId, token, platform) {
        const normalizedToken = token.trim();
        if (!normalizedToken)
            throw new Error('Device token is required');
        const existing = await this.prisma.device_tokens.findFirst({
            where: { token: normalizedToken },
        });
        if (existing) {
            await this.prisma.device_tokens.update({
                where: { id: existing.id },
                data: {
                    user_id: userId,
                    platform: platform || existing.platform,
                    is_active: true,
                    last_seen: new Date(),
                },
            });
        }
        else {
            await this.prisma.device_tokens.create({
                data: {
                    user_id: userId,
                    token: normalizedToken,
                    platform: platform || 'unknown',
                    is_active: true,
                    last_seen: new Date(),
                },
            });
        }
        return { success: true };
    }
    async removeDeviceToken(userId, token) {
        await this.prisma.device_tokens.updateMany({
            where: { user_id: userId, token },
            data: { is_active: false },
        });
        return { success: true };
    }
    async getSettings(userId) {
        const settings = await this.prisma.user_settings.findUnique({
            where: {
                user_id: userId,
            },
        });
        return {
            success: true,
            data: settings,
        };
    }
    async updateSettings(userId, body) {
        const settings = await this.prisma.user_settings.upsert({
            where: {
                user_id: userId,
            },
            update: {
                push_notifications: body.push_notifications,
                email_notifications: body.email_notifications,
                sms_notifications: body.sms_notifications,
                sound_enabled: body.sound_enabled,
                vibration_enabled: body.vibration_enabled,
            },
            create: {
                user_id: userId,
                push_notifications: body.push_notifications,
                email_notifications: body.email_notifications,
                sms_notifications: body.sms_notifications,
                sound_enabled: body.sound_enabled,
                vibration_enabled: body.vibration_enabled,
            },
        });
        return {
            success: true,
            data: settings,
        };
    }
    normalizeNotificationType(type) {
        const validTypes = new Set([
            'system', 'admin', 'transaction', 'transfer_received', 'transfer_sent', 'payment_request',
            'request_completed', 'request_declined', 'deposit_completed', 'withdrawal_completed', 'merchant',
            'system_announcement', 'kyc_update', 'security', 'escrow', 'investment', 'transfer_request',
        ]);
        const normalized = type?.toString().trim().toLowerCase();
        if (!normalized)
            return 'system';
        if (validTypes.has(normalized))
            return normalized;
        if (normalized.startsWith('merchant_payment'))
            return 'merchant';
        return 'system';
    }
    async createInApp(userId, dto) {
        const type = this.normalizeNotificationType(dto.type);
        return this.prisma.notifications.create({
            data: {
                user_id: userId,
                type,
                title: dto.title,
                body: dto.body,
                metadata: {
                    ...(dto.metadata ?? {}),
                    type: dto.type,
                    entityId: dto.entityId,
                    timestamp: new Date().toISOString(),
                },
            },
        });
    }
    async getNotifications(userId, query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const [items, total] = await Promise.all([
            this.prisma.notifications.findMany({
                where: { user_id: userId },
                skip,
                take,
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.notifications.count({ where: { user_id: userId } }),
        ]);
        return { data: items, meta: (0, pagination_util_1.paginate)(total, page, limit) };
    }
    async markRead(userId, id) {
        await this.prisma.notifications.updateMany({
            where: { id, user_id: userId },
            data: { is_read: true },
        });
        return { message: 'Notification marked as read' };
    }
    async markAllRead(userId) {
        await this.prisma.notifications.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });
        return { message: 'All notifications marked as read' };
    }
    async deleteNotification(userId, id) {
        await this.prisma.notifications.deleteMany({
            where: { id, user_id: userId },
        });
        return { message: 'Notification deleted' };
    }
    async deleteAllNotifications(userId) {
        await this.prisma.notifications.deleteMany({
            where: { user_id: userId },
        });
        return { message: 'All notifications deleted' };
    }
    async sendEmail(to, subject, html) {
        try {
            await this.mailer.sendMail({ from: this.cfg.get('SMTP_FROM'), to, subject, html });
        }
        catch (e) {
            this.logger.error(`Email failed to ${to}: ${e}`);
        }
    }
    async sendSms(phone, message) {
        if (this.twilioClient) {
            try {
                const from = this.cfg.get('TWILIO_SENDER') || this.cfg.get('TWILIO_FROM');
                await this.twilioClient.messages.create({ body: message, from, to: phone });
                this.logger.debug(`[SMS → ${phone}]: sent`);
                return true;
            }
            catch (e) {
                this.logger.error(`Twilio SMS failed to ${phone}: ${e}`);
                return false;
            }
        }
        this.logger.debug(`[SMS → ${phone}]: provider not configured, skip send`);
        return false;
    }
    async sendPush(userId, title, body, data) {
        if (!this.firebase) {
            this.logger.debug('FirebaseService not available; skipping push send');
            return false;
        }
        try {
            const tokens = await this.getDeviceTokens(userId);
            if (!tokens || tokens.length === 0)
                return false;
            const timestamp = new Date().toISOString();
            const payloadData = Object.fromEntries(Object.entries({ ...data, title, body, timestamp }).map(([key, value]) => [
                key,
                value == null ? '' : String(value),
            ]));
            const payload = {
                notification: { title, body },
                data: payloadData,
                tokens,
            };
            if (!this.firebase || !this.firebase.messaging) {
                this.logger.warn('Firebase messaging not initialized; skipping push send');
                return false;
            }
            const messaging = this.firebase?.messaging;
            if (!messaging) {
                this.logger.warn('Firebase messaging unavailable; skipping push send');
                return false;
            }
            const resp = await messaging.sendEachForMulticast(payload);
            const invalidTokens = resp.responses
                .map((result, index) => ({ result, token: tokens[index] }))
                .filter(({ result }) => {
                const code = result.error?.code;
                return code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token';
            })
                .map(({ token }) => token);
            if (invalidTokens.length > 0) {
                await this.prisma.device_tokens.updateMany({
                    where: { token: { in: invalidTokens } },
                    data: { is_active: false },
                });
            }
            this.logger.debug(`FCM sent: success=${resp.successCount} failure=${resp.failureCount}`);
            return resp.successCount > 0;
        }
        catch (e) {
            this.logger.error('FCM send failed: ' + e);
            return false;
        }
    }
    async notifyTransfer(senderId, receiverId, amount, reference) {
        const [sender, receiver, receiverWallet] = await Promise.all([
            this.prisma.users.findUnique({ where: { id: senderId }, select: { first_name: true, last_name: true, username: true } }),
            this.prisma.users.findUnique({ where: { id: receiverId }, select: { first_name: true, last_name: true, username: true } }),
            this.prisma.wallets.findFirst({ where: { user_id: receiverId }, select: { balance: true } }),
        ]);
        const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || sender?.username || 'Someone';
        const receiverName = [receiver?.first_name, receiver?.last_name].filter(Boolean).join(' ').trim() || receiver?.username || 'you';
        const balance = receiverWallet ? Number(receiverWallet.balance ?? 0) : 0;
        await Promise.all([
            this.sendNotification(senderId, {
                type: 'transfer_sent', entityId: reference, title: '✅ Transfer Sent',
                body: `You sent ${amount} FARM to ${receiverName}.`,
            }),
            this.sendNotification(receiverId, {
                type: 'transfer_received', entityId: reference, title: '💰 Money Received',
                body: `${senderName} sent you ${amount} FARM. Your balance is ${balance} FARM. Tap to view.`,
            }),
        ]);
    }
    async sendNotification(userId, dto) {
        if (!userId) {
            return null;
        }
        const timestamp = new Date().toISOString();
        const metadata = {
            ...(dto.metadata ?? {}),
            type: dto.type,
            entityId: dto.entityId ?? '',
            timestamp,
        };
        const notification = await this.createInApp(userId, {
            ...dto,
            metadata,
        });
        await this.sendPush(userId, dto.title, dto.body, {
            type: dto.type,
            entityId: dto.entityId ?? '',
            timestamp,
            notificationId: notification.id,
        });
        return notification;
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, config_1.ConfigService, firebase_service_1.FirebaseService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map