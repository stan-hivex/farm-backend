import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { BullmqService } from './bullmq.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [BullmqService],
  exports: [BullmqService],
})
export class BullmqModule {}
