import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../database/prisma.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsProcessor } from './receipts.processor';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: 'payment-receipts',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsProcessor],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
