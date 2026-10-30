import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TravelService } from './travel.service';
import { HotelsService } from './hotels.service';

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
  @IsOptional() @IsString() @Length(2, 2) nationality?: string;
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
class HotelSearchDto {
  @IsOptional() @IsString() @Length(1, 60) city_name?: string;
  @IsOptional() @IsString() @Length(2, 2) country_code?: string;
  @IsOptional() @IsString() @Length(3, 3) iata_code?: string;
  @IsString() @Length(10, 10) checkin!: string;
  @IsString() @Length(10, 10) checkout!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(6) adults!: number;
}
class HotelPrebookDto {
  @IsString() @Length(5, 4000) offer_id!: string;
}
class HotelGuestDto {
  @IsString() @Length(1, 40) first_name!: string;
  @IsString() @Length(1, 40) last_name!: string;
  @IsString() @Length(5, 120) email!: string;
  @IsString() @Length(8, 16) phone!: string;
}
class HotelBookDtoV {
  @IsString() @Length(3, 200) prebook_id!: string;
  @Type(() => Number) @IsNumber() expected_total_farm!: number;
  @IsString() @Length(8, 80) idempotency_key!: string;
  @IsString() @IsNotEmpty() pin!: string;
  @ValidateNested() @Type(() => HotelGuestDto) guest!: HotelGuestDto;
}

@UseGuards(JwtGuard)
@Controller({ path: 'travel', version: '1' })
export class TravelController {
  constructor(private readonly svc: TravelService, private readonly hotels: HotelsService) {}

  @Get('status') status() {
    const h = this.hotels.status();
    return { ...this.svc.status(), stays: h.enabled ? { provider: h.provider, sandbox: h.sandbox } : null, hotels: h };
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('hotels/search') hotelSearch(@Body() dto: HotelSearchDto) { return this.hotels.search(dto).then((data) => ({ data })); }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('hotels/prebook') hotelPrebook(@Body() dto: HotelPrebookDto) { return this.hotels.prebook(dto.offer_id); }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtGuard, KycGuard)
  @Post('hotels/book')
  hotelBook(@CurrentUser() u: any, @Body() dto: HotelBookDtoV, @Req() req: Request) { return this.hotels.book(u.id, dto, req.ip || ''); }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('hotels/bookings/:id/cancel')
  hotelCancel(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) { return this.hotels.cancel(u.id, id); }

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

class ResolveDto {
  @IsIn(['confirm', 'refund']) action!: 'confirm' | 'refund';
  @IsOptional() @IsString() @Length(5, 8) booking_reference?: string;
  @IsOptional() @IsString() @Length(1, 80) provider_order_id?: string;
  @IsString() @Length(3, 500) note!: string;
}

@ApiTags('Admin - Travel')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/travel', version: '1' })
export class AdminTravelController {
  constructor(private readonly svc: TravelService) {}

  @Get('bookings') async list(@Query('status') status?: string) {
    return { data: await this.svc.adminList(status) };
  }
  @Post('bookings/:id/resolve') resolve(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDto, @Req() req: Request) {
    return this.svc.adminResolve(u.id, id, dto, req.ip);
  }
}
