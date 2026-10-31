import { Global, Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

@Global()
@Module({
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
