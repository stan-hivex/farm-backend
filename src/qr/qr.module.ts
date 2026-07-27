import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [AuthModule, NotificationsModule], controllers: [QrController], providers: [QrService], exports: [QrService] })
export class QrModule {}