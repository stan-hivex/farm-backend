import {
  Controller,
  Get,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { DiditService } from './didit.service';

@ApiTags('Didit KYC')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'verify', version: VERSION_NEUTRAL })
export class DiditSessionController {
  constructor(private readonly diditService: DiditService) {}

  @Post('create-session')
  @ApiOperation({
    summary: 'Create a Didit verification session for the authenticated user',
  })
  createSession(@CurrentUser() user: { id: string }) {
    return this.diditService.createSession(user.id);
  }

  @Post('business/create-session')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Create a Didit KYB session for my business (503 when KYB is not configured)',
  })
  createKybSession(@CurrentUser() user: { id: string }) {
    return this.diditService.createKybSession(user.id);
  }

  @Get('business/status')
  @ApiOperation({ summary: 'Didit KYB status for my business' })
  kybStatus(@CurrentUser() user: { id: string }) {
    return this.diditService.getKybStatus(user.id);
  }
}
