import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [AuthModule, NotificationsModule],
	controllers: [KycController],
	providers: [KycService],
	exports: [KycService],
})
export class KycModule {}