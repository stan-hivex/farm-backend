import { Module } from '@nestjs/common';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { X402Chain } from './x402-chain';
import { X402Service } from './x402.service';
import { BusinessX402Controller, X402PublicController } from './x402.controller';

@Module({
  imports: [BusinessOpsModule],
  controllers: [X402PublicController, BusinessX402Controller],
  providers: [X402Service, X402Chain],
  exports: [X402Service],
})
export class X402Module {}
