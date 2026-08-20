import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IvorypayService } from './ivorypay.service';
import { IvorypayDepositService } from './ivorypay-deposit.service';
import { CryptoController } from './crypto.controller';
import { PrismaModule } from '../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule, WebsocketModule, CurrencyModule],
  controllers: [CryptoController],
  providers: [IvorypayService, IvorypayDepositService],
  exports: [IvorypayService, IvorypayDepositService],
})
export class IvorypayModule {}
