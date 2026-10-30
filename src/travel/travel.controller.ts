import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TravelService } from './travel.service';

class SearchDto {
  @IsString() @Length(3, 3) origin!: string;
  @IsString() @Length(3, 3) destination!: string;
  @IsString() departure_date!: string;
  @IsOptional() @IsString() return_date?: string;
  @IsInt() @Min(1) @Max(9) adults!: number;
  @IsOptional() @IsIn(['economy', 'premium_economy', 'business', 'first']) cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
}
class PassengerDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsIn(['mr', 'ms', 'mrs', 'miss', 'dr']) title!: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
  @IsString() @Length(1, 60) given_name!: string;
  @IsString() @Length(1, 60) family_name!: string;
  @IsIn(['m', 'f']) gender!: 'm' | 'f';
  @IsString() born_on!: string;
  @IsString() email!: string;
  @IsString() phone_number!: string;
}
class BookDtoV {
  @IsString() @IsNotEmpty() offer_id!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(9) @ValidateNested({ each: true }) @Type(() => PassengerDto) passengers!: PassengerDto[];
  @IsNumber() @Min(0) expected_total_farm!: number;
  @IsString() @Length(4, 6) pin!: string;
  @IsString() @Length(8, 80) idempotency_key!: string;
  @IsOptional() @IsUUID() ai_action_id?: string;
}

@ApiTags('Travel')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'travel', version: '1' })
export class TravelController {
  constructor(private readonly svc: TravelService) {}

  @Get('status') status() { return this.svc.status(); }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('flights/search')
  async search(@Body() dto: SearchDto) { return { data: await this.svc.search(dto) }; }

  @Get('flights/offers/:id') offer(@Param('id') id: string) { return this.svc.offer(id); }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtGuard, KycGuard)
  @Post('flights/book')
  book(@CurrentUser() u: any, @Body() dto: BookDtoV, @Req() req: Request) { return this.svc.book(u.id, dto, req.ip || ''); }

  @Get('bookings') async list(@CurrentUser() u: any) { return { data: await this.svc.list(u.id) }; }
  @Get('bookings/:id') get(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.id, id); }
}
