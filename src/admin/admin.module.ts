import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EscrowModule } from '../escrow/escrow.module';

@Module({ imports: [EscrowModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}