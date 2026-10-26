import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NowpaymentsService } from './nowpayments.service';

@Module({
  imports: [ConfigModule],
  providers: [NowpaymentsService],
  exports: [NowpaymentsService],
})
export class NowpaymentsModule {}
