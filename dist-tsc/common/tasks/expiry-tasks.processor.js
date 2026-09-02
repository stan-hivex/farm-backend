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
var ExpiryTasksProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpiryTasksProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bull_2 = require("@nestjs/bull");
const transfer_requests_service_1 = require("../../transfer-requests/transfer-requests.service");
const escrow_service_1 = require("../../escrow/escrow.service");
let ExpiryTasksProcessor = ExpiryTasksProcessor_1 = class ExpiryTasksProcessor {
    constructor(queue, transferRequests, escrowService) {
        this.queue = queue;
        this.transferRequests = transferRequests;
        this.escrowService = escrowService;
        this.logger = new common_1.Logger(ExpiryTasksProcessor_1.name);
    }
    async onModuleInit() {
        try {
            const jobs = await this.queue.getRepeatableJobs();
            const exists = jobs.some((j) => j.id === 'expiry-run');
            if (!exists) {
                await this.queue.add('run', {}, {
                    jobId: 'expiry-run',
                    repeat: { every: 60_000 },
                    removeOnComplete: { age: 24 * 60 * 60, count: 100 },
                    removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 },
                });
                this.logger.log('Scheduled repeatable expiry-run job every 60s');
            }
            else {
                this.logger.log('Expiry-run repeatable job already exists');
            }
            await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'failed', 1000);
            await this.queue.clean(24 * 60 * 60 * 1000, 'completed', 1000);
        }
        catch (e) {
            this.logger.error('Failed to ensure repeatable expiry job', e);
        }
    }
    async handleRun(job) {
        this.logger.debug('Expiry-run job triggered');
        try {
            const tr = await this.transferRequests.processExpiredRequests();
            if (tr > 0)
                this.logger.log(`Processed ${tr} expired transfer request(s)`);
        }
        catch (e) {
            this.logger.error('Error processing expired transfer requests', e);
        }
        try {
            const released = await this.escrowService.processAutoReleases();
            if (typeof released === 'number' && released > 0) {
                this.logger.log(`Auto-released ${released} escrow(s)`);
            }
        }
        catch (e) {
            this.logger.error('Error processing escrow auto-releases', e);
        }
    }
};
exports.ExpiryTasksProcessor = ExpiryTasksProcessor;
__decorate([
    (0, bull_1.Process)('run'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ExpiryTasksProcessor.prototype, "handleRun", null);
exports.ExpiryTasksProcessor = ExpiryTasksProcessor = ExpiryTasksProcessor_1 = __decorate([
    (0, bull_1.Processor)('expiry-tasks'),
    (0, common_1.Injectable)(),
    __param(0, (0, bull_2.InjectQueue)('expiry-tasks')),
    __metadata("design:paramtypes", [Object, transfer_requests_service_1.TransferRequestsService,
        escrow_service_1.EscrowService])
], ExpiryTasksProcessor);
//# sourceMappingURL=expiry-tasks.processor.js.map