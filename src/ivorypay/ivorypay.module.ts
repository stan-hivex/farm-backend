import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IvorypayService } from './ivorypay.service';

@Module({
  imports: [ConfigModule],
  providers: [IvorypayService],
  exports: [IvorypayService],
})
export class IvorypayModule {}
