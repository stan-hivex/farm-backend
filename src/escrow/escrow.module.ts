import { Module } from '@nestjs/common';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [EscrowController], providers: [EscrowService], exports: [EscrowService] })
export class EscrowModule {}