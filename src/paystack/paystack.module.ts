import {
  forwardRef,
  Module,
} from '@nestjs/common';

import { PaystackService } from './paystack.service';
import { PaystackController } from './paystack.controller';

import { DepositModule } from '../deposit/deposit.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    forwardRef(() => DepositModule),
    WebhookModule,
  ],

  providers: [PaystackService],

  controllers: [PaystackController],

  exports: [PaystackService],
})
export class PaystackModule {}