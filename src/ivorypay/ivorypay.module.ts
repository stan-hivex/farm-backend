import { forwardRef, Module } from '@nestjs/common';

import { IvorypayService } from './ivorypay.service';
import { IvorypayController } from './ivorypay.controller';
import { DepositModule } from '../deposit/deposit.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    forwardRef(() => DepositModule),
    WebhookModule,
  ],
  providers: [IvorypayService],
  controllers: [IvorypayController],
  exports: [IvorypayService],
})
export class IvorypayModule {}