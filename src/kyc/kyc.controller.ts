import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { KycService } from './kyc.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

class SubmitKycDto {
  @IsNotEmpty() @IsString() document_type!: string;
  @IsOptional() @IsString() document_number?: string;
  @IsNotEmpty() @IsString() front_image!: string;
  @IsOptional() @IsString() back_image?: string;
  @IsOptional() @IsString() selfie_image?: string;
}
class ReviewDto {
  @IsIn(['verified', 'rejected']) status!: 'verified' | 'rejected';
  @IsOptional() @IsString() rejection_reason?: string;
}

@ApiTags('KYC')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'kyc', version: '1' })
export class KycController {
  constructor(private readonly svc: KycService) {}

  @Post('submit')      submit(@CurrentUser() u: any, @Body() dto: SubmitKycDto) { return this.svc.submit(u.id, dto); }
  @Get('my')           getMyKyc(@CurrentUser() u: any) { return this.svc.getMyKyc(u.id); }

  @Get('queue')        @UseGuards(RolesGuard) @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  queue(@Query() q: any) { return this.svc.getQueue(q); }

  @Post(':id/review')  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  review(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: ReviewDto) { return this.svc.review(id, u.id, dto); }
}