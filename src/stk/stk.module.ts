import { Module } from '@nestjs/common';
import { StkPushService } from './stk.service';

@Module({
  providers: [StkPushService],
  exports: [StkPushService],
})
export class StkPushModule {}
