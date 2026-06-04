import { forwardRef, Module } from '@nestjs/common';

import { PaystackService } from './paystack.service';
import { PaystackController } from './paystack.controller';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [forwardRef(() => WebhookModule)],
  providers: [PaystackService],
  controllers: [PaystackController],
  exports: [PaystackService],
})
export class PaystackModule {}