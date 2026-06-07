import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Security')
@Controller({ path: 'security', version: '1' })
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);
  constructor(private readonly svc: SecurityService) {}

  @Get('settings')
  @UseGuards(JwtGuard)
  settings(@CurrentUser() user: any) {
    this.logger.log(`settings requested by user=${user?.id || 'anon'}`);
    return this.svc.getSettings();
  }
}
