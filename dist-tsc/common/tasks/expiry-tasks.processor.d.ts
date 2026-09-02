import type { Job, Queue } from 'bull';
import { OnModuleInit } from '@nestjs/common';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';
export declare class ExpiryTasksProcessor implements OnModuleInit {
    private readonly queue;
    private readonly transferRequests;
    private readonly escrowService;
    private readonly logger;
    constructor(queue: Queue, transferRequests: TransferRequestsService, escrowService: EscrowService);
    onModuleInit(): Promise<void>;
    handleRun(job: Job): Promise<void>;
}
