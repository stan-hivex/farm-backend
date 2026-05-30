import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional, Length, IsInt, Min, Max } from 'class-validator';
import { EscrowService } from './escrow.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class CreateEscrowDto {
  @IsNotEmpty() @IsString() seller_identifier!: string;
  @IsNumber() @IsPositive() amount!: number;
  @IsNotEmpty() @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(90) auto_release_days?: number;
  @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
}
class DisputeDto { @IsNotEmpty() @IsString() reason!: string; }
class MessageDto { @IsNotEmpty() @IsString() message!: string; }

@ApiTags('Escrow')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'escrow', version: '1' })
export class EscrowController {
  constructor(private readonly svc: EscrowService) {}

  @Get()                   list(@CurrentUser() u: any, @Query() q: any) { return this.svc.list(u.id, q); }
  @Post()
  @UseGuards(JwtGuard, KycGuard)
  create(@CurrentUser() u: any, @Body() dto: CreateEscrowDto) { return this.svc.create(u.id, dto); }
  @Get(':id')              getOne(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.getOne(id, u.id); }
  @Post(':id/release')     release(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.release(id, u.id); }
  @Post(':id/dispute')     dispute(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: DisputeDto) { return this.svc.dispute(id, u.id, dto); }
  @Post(':id/cancel')      cancel(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.cancel(id, u.id); }
  @Post(':id/message')     message(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: MessageDto) { return this.svc.addMessage(id, u.id, dto.message); }
}