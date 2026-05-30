
import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  Param,
  Get,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { JwtGuard } from '../common/guards/jwt.guard';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  /**
   * ================= REGISTER =================
   */
  @Public()
  @Post('register')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  @ApiOperation({
    summary: 'Register new user',
  })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ) {
    return this.authService.register(
      dto,
      req.ip || '',
    );
  }

  /**
   * ================= VERIFY OTP =================
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  @ApiOperation({
    summary: 'Verify OTP',
  })
  verifyOtp(
    @Body() dto: VerifyOtpDto,
  ) {
    return this.authService.verifyOtp(
      dto.phone,
      dto.otp_code,
      dto.purpose,
    );
  }

  /**
   * ================= RESEND OTP =================
   */
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 60000,
    },
  })
  @ApiOperation({
    summary: 'Resend OTP',
  })
  async resendOtp(
    @Body()
    body: {
      phone: string;
    },
  ) {
    const user =
      await (this.authService as any).prisma.users.findUnique({
        where: {
          phone: body.phone,
        },
      });

    if (!user) {
      return { message: 'If the phone number exists, an OTP was sent.' };
    }

    await this.authService.sendOtp(
      user.id,
      body.phone,
      'phone_verification',
    );
    return { message: 'If the phone number exists, an OTP was sent.' };
  }

  /**
   * ================= LOGIN =================
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  @ApiOperation({
    summary: 'Login',
  })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ) {
    return this.authService.login(
      dto,
      req.ip || '',
      req.headers['user-agent'] || '',
    );
  }

  @Public()
  @Get('admin/portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Honeypot admin portal access' })
  async honeypot(
    @Req() req: Request,
  ) {
    return this.authService.triggerHoneypot(
      '/api/v1/auth/admin/portal',
      req.ip || '',
      req.headers['user-agent'] || '',
    );
  }

  @Public()
  @Get('admin/console')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Honeypot admin console access' })
  async honeypotConsole(
    @Req() req: Request,
  ) {
    return this.authService.triggerHoneypot(
      '/api/v1/auth/admin/console',
      req.ip || '',
      req.headers['user-agent'] || '',
    );
  }

  /**
   * ================= REFRESH TOKEN =================
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 6,
      ttl: 60000,
    },
  })
  @ApiOperation({
    summary: 'Refresh token',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    const decoded = decodeJwtPayload(
      dto.refresh_token,
    );

    if (!decoded?.sub) {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    return this.authService.refresh(
      decoded.sub,
      dto.refresh_token,
      req.ip || '',
    );
  }

  /**
   * ================= LOGOUT =================
   */
  @UseGuards(JwtGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Logout',
  })
  logout(
    @CurrentUser() user: any,
  ) {
    return this.authService.logout(
      user.id,
      user.jti,
    );
  }

  @UseGuards(JwtGuard)
  @Get('sessions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List active sessions for the current user' })
  getSessions(
    @CurrentUser() user: any,
  ) {
    return this.authService.getSessions(user.id);
  }

  @UseGuards(JwtGuard)
  @Post('sessions/:id/revoke')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke a session by ID for the current user' })
  revokeSession(
    @CurrentUser() user: any,
    @Param('id') sessionId: string,
  ) {
    return this.authService.revokeSession(
      user.id,
      sessionId,
    );
  }

  @UseGuards(JwtGuard)
  @Post('sessions/revoke-others')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke all other sessions for the current user' })
  revokeOtherSessions(
    @CurrentUser() user: any,
  ) {
    return this.authService.revokeOtherSessions(
      user.id,
      user.jti,
    );
  }

  @UseGuards(JwtGuard)
  @Post('sessions/revoke-all')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke all active sessions for the current user' })
  revokeAllSessions(
    @CurrentUser() user: any,
  ) {
    return this.authService.logout(
      user.id,
      undefined,
      true,
    );
  }

  /**
   * ================= SET PIN =================
   */
  @UseGuards(JwtGuard)
  @Post('set-pin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Set PIN',
  })
  setPin(
    @CurrentUser() user: any,
    @Body() dto: SetPinDto,
  ) {
    return this.authService.setPin(
      user.id,
      dto,
    );
  }

  /**
   * ================= CHANGE PIN =================
   */
  @UseGuards(JwtGuard)
  @Post('change-pin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Change PIN',
  })
  changePin(
    @CurrentUser() user: any,
    @Body() dto: ChangePinDto,
  ) {
    return this.authService.changePin(
      user.id,
      dto,
    );
  }

  /**
   * ================= FORGOT PIN =================
   */
  @UseGuards(JwtGuard)
  @Post('forgot-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 300000,
    },
  })
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Reset forgotten PIN',
  })
  forgotPin(
    @CurrentUser() user: any,
    @Body() dto: ResetPinDto,
  ) {
    return this.authService.resetForgottenPin(
      user.id,
      dto,
    );
  }
}

/**
 * ================= JWT DECODE =================
 */
function decodeJwtPayload(
  token: string,
): any {
  try {
    return JSON.parse(
      Buffer.from(
        token.split('.')[1],
        'base64url',
      ).toString('utf8'),
    );
  } catch {
    return null;
  }
}

