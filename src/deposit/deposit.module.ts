import { forwardRef, Module } from '@nestjs/common';
import { DepositController } from './deposit.controller';
import { DepositService } from './deposit.service';
import { PrismaService } from '../database/prisma.service';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PaystackModule } from '../paystack/paystack.module';
import { StkPushModule } from '../stk/stk.module';
@Module({
  imports: [forwardRef(() => IvorypayModule), WebsocketModule, PaystackModule, StkPushModule],
  controllers: [DepositController],
  providers: [DepositService, PrismaService],
  exports: [DepositService],
})
export class DepositModule {}