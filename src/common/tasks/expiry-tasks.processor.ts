import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';
import { BullmqService } from '../bullmq/bullmq.service';

@Injectable()
export class ExpiryTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryTasksProcessor.name);

  constructor(
    private readonly bullmq: BullmqService,
    private readonly transferRequests: TransferRequestsService,
    private readonly escrowService: EscrowService,
  ) {}

  async onModuleInit() {
    const queueName = 'expiry-tasks';
    try {
      const queue: Queue = this.bullmq.getQueue(queueName) ?? this.bullmq.createQueue(queueName);

      const scheduler = await queue.getJobScheduler('expiry-run');
      if (!scheduler) {
        await queue.upsertJobScheduler(
          'expiry-run',
          { every: 60_000 },
          {
            name: 'run',
            data: {},
            opts: {
              removeOnComplete: true,
              removeOnFail: false,
            },
          },
        );
        this.logger.log('Scheduled repeatable expiry-run job every 60s');
      } else {
        this.logger.log('Expiry-run repeatable job already exists');
      }

      this.bullmq.createWorker(queueName, async (job: Job) => this.handleRun(job), {
        autorun: true,
      });
      this.logger.log(`ExpiryTasksProcessor worker created for queue=${queueName}`);
    } catch (e) {
      this.logger.error('Failed to initialize expiry task queue', e as any);
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
