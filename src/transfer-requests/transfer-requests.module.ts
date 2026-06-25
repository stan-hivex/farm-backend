import { Module } from '@nestjs/common';
import { TransferRequestsController } from './transfer-requests.controller';
import { TransferRequestsService } from './transfer-requests.service';
import { AuthModule } from '../auth/auth.module';
import { KycGuard } from '../common/guards/kyc.guard';

@Module({
  imports: [AuthModule],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, KycGuard],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
