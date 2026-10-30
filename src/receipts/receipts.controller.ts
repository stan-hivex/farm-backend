import type { AuthUser } from '../common/types/auth-user';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { ReceiptsService } from './receipts.service';

@ApiTags('Receipts')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'receipts', version: '1' })
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.receipts.listForMerchantOwner(user.id, query);
  }

  @Get(':id/download')
  download(@CurrentUser() user: AuthUser, @Param('id') receiptId: string) {
    return this.receipts.getDownloadUrlForMerchantOwner(user.id, receiptId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') receiptId: string) {
    return this.receipts.getForMerchantOwner(user.id, receiptId);
  }
}
