import { Processor, Process } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';

@Processor('expiry-tasks')
@Injectable()
export class ExpiryTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryTasksProcessor.name);

  constructor(
    @InjectQueue('expiry-tasks') private readonly queue: Queue,
    private readonly transferRequests: TransferRequestsService,
    private readonly escrowService: EscrowService,
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
      this.logger.error('Failed to ensure repeatable expiry job', e as any);
    }
  }

  @Process('run')
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
