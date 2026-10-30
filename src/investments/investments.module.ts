import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { ProjectMarketplaceModule } from '../project-marketplace/project-marketplace.module';

@Module({
  imports: [AuthModule, ProjectMarketplaceModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
