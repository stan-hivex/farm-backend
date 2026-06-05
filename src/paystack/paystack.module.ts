import { forwardRef, Module } from '@nestjs/common';

import { PaystackService } from './paystack.service';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [forwardRef(() => WebhookModule)],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}