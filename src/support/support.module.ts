import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportService } from './support.service';
import { AdminSupportController, UserSupportController } from './support.controller';
import { CloudinaryService } from '../common/cloudinary.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [UserSupportController, AdminSupportController],
  providers: [SupportService, CloudinaryService],
})
export class SupportModule {}
