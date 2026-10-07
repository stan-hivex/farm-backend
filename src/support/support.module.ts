import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { SupportService } from './support.service';
import { AdminSupportController, UserSupportController } from './support.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserSupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
