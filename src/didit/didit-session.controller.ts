import { Controller, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
