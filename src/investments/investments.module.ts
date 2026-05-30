import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [InvestmentsController], providers: [InvestmentsService], exports: [InvestmentsService] })
export class InvestmentsModule {}