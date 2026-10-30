import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { AdminPaymentsMonitorController } from './admin-payments-monitor.controller';
import { X402Chain } from './x402-chain';
import { X402Service } from './x402.service';
import {
  BusinessX402Controller,
  X402PublicController,
} from './x402.controller';

@Module({
  imports: [AuthModule, BusinessOpsModule],
  controllers: [
    X402PublicController,
    BusinessX402Controller,
    AdminPaymentsMonitorController,
  ],
  providers: [X402Service, X402Chain],
  exports: [X402Service],
})
export class X402Module {}
