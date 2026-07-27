import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';

@Module({ imports: [AuthModule, NotificationsModule, SecurityModule], controllers: [QrController], providers: [QrService], exports: [QrService] })
export class QrModule {}