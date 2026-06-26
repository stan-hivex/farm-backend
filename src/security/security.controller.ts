import { Controller, Get, Put, Post, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

  @Put('biometrics')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable biometric authentication' })
  async updateBiometrics(
    @CurrentUser() user: any,
    @Body() body: { enabled: boolean; deviceFingerprint?: string; biometricType?: string },
  ) {
    this.logger.log(`Biometric update requested by user=${user?.id}, enabled=${body.enabled}`);

    if (body.enabled) {
      if (!body.deviceFingerprint) {
        throw new BadRequestException('deviceFingerprint is required when enabling biometrics');
      }
      return this.svc.enableBiometrics(user.id, body.deviceFingerprint, body.biometricType);
    } else {
      return this.svc.disableBiometrics(user.id);
    }
  }

  @Post('verify-device')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify device fingerprint on app resume' })
  async verifyDevice(
    @CurrentUser() user: any,
    @Body() body: { deviceFingerprint: string },
  ) {
    this.logger.log(`Device verification requested by user=${user?.id}`);
    return this.svc.verifyDevice(user.id, body.deviceFingerprint);
  }

  @Get('biometrics')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get biometric settings status' })
  async getBiometricStatus(@CurrentUser() user: any) {
    this.logger.log(`Biometric status requested by user=${user?.id}`);
    return this.svc.getBiometricStatus(user.id);
  }
}
