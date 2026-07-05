import { Controller, Get, Put, Post, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional } from 'class-validator';
import { SecurityService } from './security.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

class UpdateBiometricsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  biometricType?: string;
}

class VerifyDeviceDto {
  @IsString()
  deviceFingerprint!: string;
}

@ApiTags('Security')
@Controller({ path: 'security', version: '1' })
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);
  constructor(private readonly svc: SecurityService) {}

  @Permissions('security:read')
  @Get('settings')
  @UseGuards(JwtGuard)
  settings(@CurrentUser() user: any) {
    this.logger.log(`settings requested by user=${user?.id || 'anon'}`);
    return this.svc.getSettings();
  }

  @Permissions('security:write')
  @Put('biometrics')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable biometric authentication' })
  async updateBiometrics(
    @CurrentUser() user: any,
    @Body() dto: UpdateBiometricsDto,
  ) {
    this.logger.log(`Biometric update requested by user=${user?.id}, enabled=${dto.enabled}`);

    if (dto.enabled) {
      if (!dto.deviceFingerprint) {
        throw new BadRequestException('deviceFingerprint is required when enabling biometrics');
      }
      return this.svc.enableBiometrics(user.id, dto.deviceFingerprint, dto.biometricType);
    } else {
      return this.svc.disableBiometrics(user.id);
    }
  }

  @Permissions('security:write')
  @Post('verify-device')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify device fingerprint on app resume' })
  async verifyDevice(
    @CurrentUser() user: any,
    @Body() dto: VerifyDeviceDto,
  ) {
    this.logger.log(`Device verification requested by user=${user?.id}`);
    return this.svc.verifyDevice(user.id, dto.deviceFingerprint);
  }

  @Permissions('security:read')
  @Get('biometrics')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get biometric settings status' })
  async getBiometricStatus(@CurrentUser() user: any) {
    this.logger.log(`Biometric status requested by user=${user?.id}`);
    return this.svc.getBiometricStatus(user.id);
  }
}
