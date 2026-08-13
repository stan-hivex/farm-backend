import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { CurrencyConversionService } from './currency-conversion.service';

@Module({
  imports: [PrismaModule],
  providers: [CurrencyConversionService],
  exports: [CurrencyConversionService],
})
export class CurrencyModule {}
