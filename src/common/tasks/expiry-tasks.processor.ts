import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TransferRequestsService } from '../../transfer-requests/transfer-requests.service';
import { EscrowService } from '../../escrow/escrow.service';

@Injectable()
export class ExpiryTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryTasksProcessor.name);

  constructor(
    private readonly transferRequests: TransferRequestsService,
    private readonly escrowService: EscrowService,
  ) {}

  async onModuleInit() {
    this.logger.warn('ExpiryTasksProcessor worker is disabled because async queue support was removed.');
  }

  async handleRun() {
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
