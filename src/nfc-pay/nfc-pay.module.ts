import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';
import { NfcPayController } from './nfc-pay.controller';
import { NfcPayService } from './nfc-pay.service';

@Module({
  imports: [PrismaModule, AuthModule, WalletsModule],
  providers: [NfcPayService],
  controllers: [NfcPayController],
})
export class NfcPayModule {}
