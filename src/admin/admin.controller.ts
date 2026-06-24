import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsBoolean, IsNumber, IsNotEmpty } from 'class-validator';
import { AdminService } from './admin.service';
import { WithdrawService } from '../withdraw/withdraw.service';
import { NotFoundException } from '@nestjs/common';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

class UserStatusDto { @IsOptional() @IsBoolean() is_active?: boolean; @IsOptional() @IsBoolean() is_suspended?: boolean; }
class ResolveDto { @IsIn(['buyer','seller']) winner!: 'buyer'|'seller'; @IsString() note!: string; }
class MerchantDecisionDto { @IsIn(['approved','rejected']) status!: 'approved'|'rejected'; @IsOptional() @IsString() rejection_reason?: string; }
class SettingDto { @IsString() value!: string; }

class ExchangeRateDto {
  @IsString() base_currency!: string;
  @IsString() target_currency!: string;
  @IsNumber() rate!: number;
}

class ExchangeRatesDto {
  @IsNotEmpty() rates!: ExchangeRateDto[];
}

class CreateSuperadminDto {
  @IsString() first_name!: string;
  @IsString() last_name!: string;
  @IsString() username!: string;
  @IsString() phone!: string;
  @IsString() email!: string;
  @IsString() password!: string;
  @IsString() country!: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsBoolean() is_suspended?: boolean;
}

class SendNotificationDto {
  @IsString() user_id!: string;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() metadata?: any;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
}

class BroadcastNotificationDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() metadata?: any;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsString() target_role?: string;
}

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly svc: AdminService, private readonly withdrawService: WithdrawService) {}

  @Get('dashboard')               stats() { return this.svc.getDashboardStats(); }
  @Get('transactions')            transactions(@Query() q: any) { return this.svc.listTransactions(q); }
  @Get('users')                   users(@Query() q: any) { return this.svc.listUsers(q); }
  @Get('users/:id')               user(@Param('id') id: string) { return this.svc.getUserDetail(id); }
  @Patch('users/:id/status')      userStatus(@Param('id') id: string, @Body() dto: UserStatusDto, @CurrentUser() u: any) { return this.svc.updateUserStatus(id, dto, u.id); }
  @Patch('users/:id')             updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: any) { return this.svc.updateUser(id, dto, u.id); }
  @Delete('users/:id')            deleteUser(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteUser(id, u.id); }
  @Get('escrow')                  escrows(@Query() q: any) { return this.svc.listAllEscrows(q); }
  @Get('escrow/:id')              escrowDetail(@Param('id') id: string) { return this.svc.getEscrow(id); }
  @Post('escrow/:id/resolve')     resolve(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: ResolveDto) { return this.svc.resolveDispute(id, u.id, dto); }
  @Get('merchants')               merchants(@Query() q: any) { return this.svc.listMerchants(q); }
  @Post('merchants/:id/decision') decision(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: MerchantDecisionDto) { return this.svc.approveMerchant(id, u.id, dto); }
  @Get('payouts')                 payouts(@Query() q: any) { return this.svc.listPayouts(q); }
  @Post('payouts/:id/process')    processPayout(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.processPayout(id, u.id, 'completed'); }
  @Post('notifications/send')     sendNotification(@CurrentUser() u: any, @Body() dto: SendNotificationDto) { return this.svc.sendNotification(u.id, dto); }
  @Post('notifications/broadcast') broadcastNotification(@CurrentUser() u: any, @Body() dto: BroadcastNotificationDto) { return this.svc.broadcastNotification(u.id, dto); }
  @Get('kyc/queue')               kycQueue(@Query() q: any) { return this.svc.listKycQueue(q); }
  @Post('kyc/:id/review')         reviewKyc(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: ResolveDto) { return this.svc.reviewKyc(id, u.id, dto as any); }
  @Get('analytics')               analytics() { return this.svc.getAdminAnalytics(); }
  @Get('settings')                settings() { return this.svc.getSettings(); }
  @Put('settings/:key')           updateSetting(@Param('key') key: string, @Body() dto: SettingDto, @CurrentUser() u: any) { return this.svc.updateSetting(key, dto.value, u.id); }
  @Get('exchange-rates')          getExchangeRates() { return this.svc.getExchangeRates(); }
  @Put('exchange-rates')          updateExchangeRates(@Body() dto: ExchangeRatesDto, @CurrentUser() u: any) { return this.svc.updateExchangeRates(dto.rates, u.id); }
  @Get('audit-logs')              auditLogs(@Query() q: any) { return this.svc.getAuditLogs(q); }
  @Post('investments')            createProject(@CurrentUser() u: any, @Body() dto: any) { return this.svc.createProject(u.id, dto); }
  @Put('investments/:id')         updateProject(@Param('id') id: string, @Body() dto: any) { return this.svc.updateProject(id, dto); }

  // ── Audit Dashboard ──────────────────────────────────────────────────────────
  @Get('audit/dashboard')         auditDashboard() { return this.svc.getAuditDashboard(); }
  @Get('audit/security-events')   securityEvents(@Query() q: any) { return this.svc.getSecurityEvents(q); }
  @Get('audit/security-stats')    securityStats() { return this.svc.getSecurityStats(); }
  @Get('audit/users/:id/activity') userActivity(@Param('id') id: string, @Query() q: any) { return this.svc.getUserActivityLog(id, q); }
  @Get('audit/users/:id/sessions') userSessions(@Param('id') id: string, @Query() q: any) { return this.svc.getUserSessions(id, q); }
  @Get('audit/admin-logs')        adminLogs(@Query() q: any) { return this.svc.getAdminAuditLog(q); }
  @Get('audit/compliance')        complianceReport(@Query() q: any) { return this.svc.getComplianceReport(q); }

  @Get('withdrawals')             allWithdrawals(@Query() q: any) { return this.svc.listAllWithdrawals(q); }

  @Post('withdrawals/:id/process')
  async processWithdrawal(@Param('id') id: string, @CurrentUser() u: any) {
    const w = await this.withdrawService.getWithdrawal(id);
    if (!w) throw new NotFoundException('Withdrawal not found');
    // For admin-triggered processing we mark as success (webhook will normally confirm)
    await this.withdrawService.markAsSuccess(w.reference);
    return { message: 'Withdrawal processed (marked completed)' };
  }

  // ── Superadmin Wallet ────────────────────────────────────────────────────────
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get('wallet')
  async getSuperadminWallet(@CurrentUser() u: any) {
    return this.svc.getSuperadminWallet(u.id);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post('wallet/withdraw')
  async withdrawSuperadminFunds(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.superadminWithdraw(u.id, dto);
  }

  // ── Superadmin Management ────────────────────────────────────────────────────
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('superadmin/create')
  createSuperadmin(@Body() dto: CreateSuperadminDto, @CurrentUser() u: any) {
    return this.svc.createSuperadmin(dto, u.id);
  }

  @Get('superadmin/list')
  listSuperadmins(@Query() q: any) {
    return this.svc.listSuperadmins(q);
  }

  @Get('superadmin/:id')
  getSuperadmin(@Param('id') id: string) {
    return this.svc.getSuperadmin(id);
  }

  @Patch('superadmin/:id')
  @Roles(UserRole.ADMIN)
  updateSuperadmin(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.updateSuperadmin(id, dto, u.id);
  }

  @Post('superadmin/:id/deactivate')
  @Roles(UserRole.ADMIN)
  deactivateSuperadmin(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deactivateSuperadmin(id, u.id);
  }
}

// ── Superadmin Controller ────────────────────────────────────────────────────
@ApiTags('Superadmin')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller({ path: 'superadmin', version: '1' })
export class SuperadminController {
  constructor(private readonly svc: AdminService) {}

  @Get('dashboard')
  superadminDashboard() {
    return this.svc.getSuperadminDashboard();
  }
}