import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [AuthModule, NotificationsModule], controllers: [InvestmentsController], providers: [InvestmentsService], exports: [InvestmentsService] })
export class InvestmentsModule {}