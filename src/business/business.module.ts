import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminBusinessController,
  BusinessController,
} from './business.controller';
import { BusinessService } from './business.service';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController, AdminBusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
