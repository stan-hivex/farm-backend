
import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  Param,
  Get,
  Query,
  ExecutionContext,
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
import { SupabaseAuthDto } from './dto/supabase-auth.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { ResetPinDto } from './dto/reset-pin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

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
      ttl: 60,
      generateKey: authThrottleKey,
    },
  })
  @ApiOperation({
    summary: 'Register new user',
  })
  register(
    @Body() body: RegisterDto | SupabaseAuthDto,
    @Req() req: Request,
  ) {
    if (this.isSupabaseAuthBody(body)) {
      return this.authService.supabaseLogin(
        body.supabase_token,
        req.ip || '',
        req.headers['user-agent'] || '',
      );
    }

    return this.authService.register(body as RegisterDto, req.ip || '');
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
      ttl: 60,
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
      ttl: 60,
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
   * ================= FORGOT PASSWORD =================
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 300,
      generateKey: authThrottleKey,
    },
  })
  @ApiOperation({ summary: 'Send password reset OTP to email' })
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.sendPasswordResetOtp(dto.email, req.ip || '');
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 300,
    },
  })
  @ApiOperation({ summary: 'Reset password using OTP' })
  resetPassword(
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }

  /**
   * ================= RESEND EMAIL VERIFICATION =================
   */
  @Public()
  @Post('resend-email-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 60000,
    },
  })
  @ApiOperation({ summary: 'Resend email verification link' })
  resendEmailVerification(
    @Body()
    body: {
      email: string;
    },
  ) {
    return this.authService.resendEmailVerification(body.email);
  }

  /**
   * ================= VERIFY EMAIL =================
   */
  @Public()
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  verifyEmail(
    @Param('token') token: string | undefined,
    @Query('token') queryToken: string | undefined,
  ) {
    return this.authService.verifyEmail(token || queryToken || '');
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
      ttl: 60,
      generateKey: authThrottleKey,
    },
  })
  @ApiOperation({
    summary: 'Login',
  })
  login(
    @Body() body: LoginDto | SupabaseAuthDto,
    @Req() req: Request,
  ) {
    if (this.isSupabaseAuthBody(body)) {
      return this.authService.supabaseLogin(
        body.supabase_token,
        req.ip || '',
        req.headers['user-agent'] || '',
      );
    }

    throw new BadRequestException('Login now requires a Supabase access token. Please use Supabase authentication.');
  }

  @Public()
  @Post('supabase')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
      generateKey: authThrottleKey,
    },
  })
  @ApiOperation({
    summary: 'Login or register with a Supabase access token',
  })
  supabaseAuth(
    @Body() dto: SupabaseAuthDto,
    @Req() req: Request,
  ) {
    return this.authService.supabaseLogin(
      dto.supabase_token,
      req.ip || '',
      req.headers['user-agent'] || '',
    );
  }

  private isSupabaseAuthBody(body: unknown): body is SupabaseAuthDto {
    return typeof body === 'object' && body !== null && typeof (body as SupabaseAuthDto).supabase_token === 'string' && (body as SupabaseAuthDto).supabase_token.trim().length > 0;
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
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password and revoke all other sessions' })
  changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
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

function authThrottleKey(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<Request>();
  const ip = request.ip || 'unknown-ip';
  const body: Record<string, any> = request.body || {};
  const identifier = (
    body.identifier || body.email || body.phone || body.supabase_token || ''
  ).toString().trim().toLowerCase();

  return identifier.length > 0
    ? `${ip}:${identifier}`
    : `${ip}:anonymous`;
}

