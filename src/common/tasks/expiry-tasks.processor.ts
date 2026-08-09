import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';
import { BullmqService } from '../bullmq.service';

@Injectable()
export class ExpiryTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryTasksProcessor.name);

  constructor(
    private readonly bullmq: BullmqService,
    private readonly transferRequests: TransferRequestsService,
    private readonly escrowService: EscrowService,
  ) {}

  async onModuleInit() {
    try {
      this.bullmq.createWorker('expiry-tasks', async (job: Job) => {
        return this.handleRun(job);
      });

      const queue = this.bullmq.getQueue('expiry-tasks');
      await queue.upsertJobScheduler('expiry-run', { every: 60_000 }, { name: 'run', data: {}, opts: { removeOnComplete: true, removeOnFail: false } });
      this.logger.log('Scheduled repeatable expiry-run job every 60s');
    } catch (e) {
      this.logger.error('Failed to ensure repeatable expiry job', e as any);
    }
  }

  async handleRun(job: Job) {
    this.logger.debug('Expiry-run job triggered');
    try {
      const tr = await this.transferRequests.processExpiredRequests();
      if (tr > 0) this.logger.log(`Processed ${tr} expired transfer request(s)`);
    } catch (e) {
      this.logger.error('Error processing expired transfer requests', e as any);
    }

    try {
      const released = await this.escrowService.processAutoReleases();
      if (typeof released === 'number' && released > 0) {
        this.logger.log(`Auto-released ${released} escrow(s)`);
      }
    } catch (e) {
      this.logger.error('Error processing escrow auto-releases', e as any);
    }
  }
}
