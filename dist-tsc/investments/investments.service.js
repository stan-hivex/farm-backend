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
var InvestmentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestmentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const notifications_service_1 = require("../notifications/notifications.service");
const reference_util_1 = require("../common/utils/reference.util");
const pagination_util_1 = require("../common/utils/pagination.util");
let InvestmentsService = InvestmentsService_1 = class InvestmentsService {
    constructor(prisma, authService, notificationsService) {
        this.prisma = prisma;
        this.authService = authService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(InvestmentsService_1.name);
    }
    async listProjects(query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const where = query.status ? { status: query.status } : { status: 'open' };
        if (query.category)
            where.category = { contains: query.category, mode: 'insensitive' };
        const [items, total] = await Promise.all([
            this.prisma.investment_projects.findMany({
                where, skip, take, orderBy: { created_at: 'desc' },
            }),
            this.prisma.investment_projects.count({ where }),
        ]);
        return {
            data: items.map((p) => ({
                ...p,
                target_amount: Number(p.target_amount),
                raised_amount: Number(p.raised_amount),
                minimum_investment: Number(p.minimum_investment),
                roi_percent: Number(p.roi_percent),
            })),
            meta: (0, pagination_util_1.paginate)(total, page, limit),
        };
    }
    async getProject(id) {
        const project = await this.prisma.investment_projects.findUnique({ where: { id } });
        if (!project)
            throw new common_1.NotFoundException('Investment project not found');
        const progress = Number(project.target_amount) > 0
            ? (Number(project.raised_amount) / Number(project.target_amount)) * 100
            : 0;
        return {
            data: {
                ...project,
                target_amount: Number(project.target_amount),
                raised_amount: Number(project.raised_amount),
                minimum_investment: Number(project.minimum_investment),
                roi_percent: Number(project.roi_percent),
                funding_progress: Math.min(100, progress),
            },
        };
    }
    async invest(userId, projectId, dto) {
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('Amount must be positive');
        await this.authService.verifyPin(userId, dto.pin);
        const project = await this.prisma.investment_projects.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException('Project not found');
        if (project.status !== 'open')
            throw new common_1.BadRequestException('Project is not open for investment');
        if (project.ends_at && new Date() > project.ends_at)
            throw new common_1.BadRequestException('Investment period has ended');
        if (project.minimum_investment && dto.amount < Number(project.minimum_investment))
            throw new common_1.BadRequestException(`Minimum investment is ${project.minimum_investment} FARM`);
        const wallet = await this.prisma.wallets.findFirst({
            where: { user_id: userId, is_active: true },
        });
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
        const available = Number(wallet.balance) - Number(wallet.locked_balance);
        if (available < dto.amount)
            throw new common_1.BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
        const expectedRoi = dto.amount * (Number(project.roi_percent) / 100);
        const maturityDate = new Date();
        maturityDate.setMonth(maturityDate.getMonth() + (project.duration_months || 12));
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.wallets.update({
                where: { id: wallet.id }, data: { balance: { decrement: dto.amount } },
            });
            const txn = await tx.transactions.create({
                data: {
                    transaction_reference: (0, reference_util_1.generateTxReference)(),
                    sender_wallet_id: wallet.id,
                    transaction_type: 'investment',
                    status: 'completed',
                    amount: dto.amount, fee: 0, net_amount: dto.amount,
                    description: `Investment: ${project.project_name}`,
                    metadata: { user_id: userId },
                    processed_at: new Date(),
                },
            });
            const investment = await tx.user_investments.create({
                data: {
                    user_id: userId, project_id: projectId, amount: dto.amount,
                    expected_roi: expectedRoi, transaction_id: txn.id,
                    status: 'active', maturity_date: maturityDate,
                },
            });
            await tx.investment_projects.update({
                where: { id: projectId },
                data: { raised_amount: { increment: dto.amount }, total_backers: { increment: 1 } },
            });
            await tx.ledger_entries.create({
                data: {
                    transaction_id: txn.id, wallet_id: wallet.id,
                    entry_type: 'debit', amount: dto.amount,
                    description: `Investment in ${project.project_name}`,
                },
            });
            return investment;
        });
        await this.notificationsService.sendNotification(userId, {
            type: 'investment_made',
            title: 'Investment successful',
            body: `You invested ${dto.amount} FARM in ${project.project_name}.`,
            entityId: result.id,
            metadata: {
                investment_id: result.id,
                project_id: projectId,
                project_name: project.project_name,
                amount: dto.amount,
            },
        }).catch((error) => this.logger.error('Investment notification failed', error));
        return {
            data: { ...result, amount: Number(result.amount), expected_roi: Number(result.expected_roi) },
            message: 'Investment successful',
        };
    }
    async getMyInvestments(userId, query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const [items, total] = await Promise.all([
            this.prisma.user_investments.findMany({
                where: { user_id: userId }, skip, take,
                orderBy: { invested_at: 'desc' },
                include: {
                    investment_projects: {
                        select: { project_name: true, roi_percent: true, status: true },
                    },
                },
            }),
            this.prisma.user_investments.count({ where: { user_id: userId } }),
        ]);
        const totalInvested = items.reduce((s, i) => s + Number(i.amount), 0);
        return {
            data: items.map((i) => ({
                ...i,
                amount: Number(i.amount),
                expected_roi: Number(i.expected_roi),
            })),
            meta: { ...(0, pagination_util_1.paginate)(total, page, limit), total_invested: totalInvested },
        };
    }
};
exports.InvestmentsService = InvestmentsService;
exports.InvestmentsService = InvestmentsService = InvestmentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        notifications_service_1.NotificationsService])
], InvestmentsService);
//# sourceMappingURL=investments.service.js.map