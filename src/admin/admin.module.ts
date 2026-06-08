import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [EscrowModule, NotificationsModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}