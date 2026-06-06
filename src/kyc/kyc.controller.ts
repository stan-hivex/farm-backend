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
  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() postal_code?: string;
}
class ReviewDto {
  @IsIn(['under_review', 'verified', 'rejected', 'additional_info_required'])
  status!: 'under_review' | 'verified' | 'rejected' | 'additional_info_required';
  @IsOptional() @IsString() rejection_reason?: string;
}

@ApiTags('KYC')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'kyc', version: '1' })
export class KycController {
  constructor(private readonly svc: KycService) {}

  @Post('submit')
  submit(@CurrentUser() u: any, @Body() body: any) {
    const dto: SubmitKycDto = {
      document_type: body.document_type || body.documentType,
      document_number: body.document_number || body.documentNumber,
      front_image: body.front_image || body.frontImage,
      back_image: body.back_image || body.backImage,
      selfie_image: body.selfie_image || body.selfieImage,
      first_name: body.first_name || body.firstName,
      last_name: body.last_name || body.lastName,
      dob: body.dob || body.dateOfBirth || body.date_of_birth,
      gender: body.gender,
      nationality: body.nationality,
      phone: body.phone,
      email: body.email,
      country: body.country,
      state: body.state || body.county || body.county_state,
      city: body.city,
      address: body.address,
      postal_code: body.postal_code || body.postalCode,
    };
    return this.svc.submit(u.id, dto);
  }
  @Get('my')           getMyKyc(@CurrentUser() u: any) { return this.svc.getMyKyc(u.id); }

  @Get('queue')        @UseGuards(RolesGuard) @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  queue(@Query() q: any) { return this.svc.getQueue(q); }

  @Post(':id/review')  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  review(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: ReviewDto) { return this.svc.review(id, u.id, dto); }
}