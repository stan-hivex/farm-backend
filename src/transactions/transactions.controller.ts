import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequireOwnership } from '../common/decorators/ownership.decorator';

@ApiTags('Transactions')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'transactions', version: '1' })
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}
  @Permissions('transactions:read')
  @Get()      findAll(@CurrentUser() u: any, @Query() q: any) { return this.svc.findAll(u.id, q); }

  @Permissions('transactions:read')
  @RequireOwnership('id')
  @Get(':id') findOne(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.findOne(u.id, id); }
}