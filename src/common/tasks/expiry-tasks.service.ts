// The in-process scheduler has been replaced by a Bull-based repeatable job.
// The implementation remains for backward-compatibility but is no-op.
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ExpiryTasksService {
  private readonly logger = new Logger(ExpiryTasksService.name);
  constructor() {
    this.logger.log('ExpiryTasksService initialized (noop - using Bull repeatable job)');
  }
}
