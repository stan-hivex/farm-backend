import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { ApiPayoutsService } from './api-payouts.service';
import { DashboardPayoutDto } from './business-api.dto';

/** Business dashboard payouts: automatic like app withdrawals (Owner/Finance + PIN). */
@ApiTags('Business - Payouts')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'business', version: '1' })
export class BusinessPayoutsController {
  constructor(
    private readonly payouts: ApiPayoutsService,
    private readonly access: BusinessAccessService,
    private readonly auth: AuthService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('payouts')
  @ApiOperation({
    summary: 'Automatic payout from the business wallet (Owner/Finance, PIN)',
  })
  request(
    @CurrentUser() u: any,
    @Body() dto: DashboardPayoutDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payouts.createFromDashboard(
      this.access,
      (id, pin) => this.auth.verifyPin(id, pin),
      u.id,
      dto,
      key || `dash_${randomUUID()}`,
    );
  }
}
