import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [QrController], providers: [QrService], exports: [QrService] })
export class QrModule {}