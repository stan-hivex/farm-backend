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
var WebsocketGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsocketGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
let WebsocketGateway = WebsocketGateway_1 = class WebsocketGateway {
    constructor(jwtService, cfg) {
        this.jwtService = jwtService;
        this.cfg = cfg;
        this.logger = new common_1.Logger(WebsocketGateway_1.name);
        this.userSockets = new Map();
    }
    handleConnection(client) {
        this.logger.debug(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        for (const [userId, socketId] of this.userSockets.entries()) {
            if (socketId === client.id) {
                this.userSockets.delete(userId);
                break;
            }
        }
        this.logger.debug(`Client disconnected: ${client.id}`);
    }
    async handleIdentify(data, client) {
        try {
            const payload = this.jwtService.verify(data.token, {
                secret: this.cfg.get('JWT_ACCESS_SECRET'),
            });
            const userId = payload.sub;
            this.userSockets.set(userId, client.id);
            client.join(`user:${userId}`);
            return { event: 'identified', data: { user_id: userId } };
        }
        catch (error) {
            this.logger.warn(`WebSocket identify failed: ${error}`);
            client.disconnect(true);
            return { event: 'error', data: { message: 'Unauthorized' } };
        }
    }
    emitToUser(userId, event, data) {
        this.server.to(`user:${userId}`).emit(event, data);
    }
    emitTransactionUpdate(userId, transaction) {
        this.emitToUser(userId, 'transaction:update', transaction);
    }
    emitEscrowUpdate(userId, escrow) {
        this.emitToUser(userId, 'escrow:update', escrow);
    }
    emitBalanceUpdate(userId, balance) {
        this.emitToUser(userId, 'balance:update', { balance });
    }
};
exports.WebsocketGateway = WebsocketGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WebsocketGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('identify'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], WebsocketGateway.prototype, "handleIdentify", null);
exports.WebsocketGateway = WebsocketGateway = WebsocketGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean),
        },
        namespace: '/ws',
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService, config_1.ConfigService])
], WebsocketGateway);
//# sourceMappingURL=websocket.gateway.js.map