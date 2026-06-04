import { forwardRef, Module } from '@nestjs/common';

import { IvorypayService } from './ivorypay.service';
import { IvorypayController } from './ivorypay.controller';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [forwardRef(() => WebhookModule)],
  providers: [IvorypayService],
  controllers: [IvorypayController],
  exports: [IvorypayService],
})
export class IvorypayModule {}