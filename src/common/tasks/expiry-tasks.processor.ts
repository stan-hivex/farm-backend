import { Processor, Process } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';
import { ModuleRef } from '@nestjs/core';
import { PaymentRequestsService } from '../../payment-requests/payment-requests.service';

@Processor('expiry-tasks')
@Injectable()
export class ExpiryTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryTasksProcessor.name);

  constructor(
    @InjectQueue('expiry-tasks') private readonly queue: Queue,
    private readonly transferRequests: TransferRequestsService,
    private readonly escrowService: EscrowService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    // Ensure a single repeatable job exists (idempotent via jobId)
    try {
      const jobs = await this.queue.getRepeatableJobs();
      const exists = jobs.some((j) => j.id === 'expiry-run');
      if (!exists) {
        await this.queue.add(
          'run',
          {},
          {
            jobId: 'expiry-run',
            repeat: { every: 60_000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        this.logger.log('Scheduled repeatable expiry-run job every 60s');
      } else {
        this.logger.log('Expiry-run repeatable job already exists');
      }
    } catch (e) {
      this.logger.error('Failed to ensure repeatable expiry job', e);
    }
  }

  @Process('run')
  async handleRun(job: Job) {
    this.logger.debug('Expiry-run job triggered');
    try {
      const tr = await this.transferRequests.processExpiredRequests();
      if (tr > 0)
        this.logger.log(`Processed ${tr} expired transfer request(s)`);
    } catch (e) {
      this.logger.error('Error processing expired transfer requests', e);
    }

    try {
      // Resolved lazily (strict: false) to avoid a module import cycle.
      const paymentRequests = this.moduleRef.get(PaymentRequestsService, {
        strict: false,
      });
      const pr = await paymentRequests.processExpiredRequests();
      if (pr > 0) this.logger.log(`Processed ${pr} expired payment request(s)`);
    } catch (e) {
      this.logger.error('Error processing expired payment requests', e);
    }

    try {
      const released = await this.escrowService.processAutoReleases();
      if (typeof released === 'number' && released > 0) {
        this.logger.log(`Auto-released ${released} escrow(s)`);
      }
    } catch (e) {
      this.logger.error('Error processing escrow auto-releases', e);
    }
  }
}
