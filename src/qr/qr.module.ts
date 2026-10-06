import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityModule } from '../security/security.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({ imports: [AuthModule, NotificationsModule, SecurityModule, WebsocketModule], controllers: [QrController], providers: [QrService], exports: [QrService] })
export class QrModule {}