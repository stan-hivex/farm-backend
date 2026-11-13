import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: string;
  role: string;
  wallet_id?: string;
  jti: string;
}

import { requireJwtAccessSecret } from '../jwt-secret';
import { isSessionActive } from '../../notifications/push-device-registry';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private cfg: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtAccessSecret(cfg),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        is_active: true,
        is_suspended: true,
        is_deleted: true,
      },
    });

    if (!user || !user.is_active || user.is_suspended || user.is_deleted)
      throw new UnauthorizedException('Account unavailable');

    // A revoked or expired session is rejected immediately. The JTI is an
    // identifier, not the bearer token, and is the only session detail logged.
    if (payload.jti) {
      const session = await this.prisma.user_sessions.findFirst({
        where: {
          jwt_id: payload.jti,
          user_id: payload.sub,
          OR: [{ is_revoked: false }, { is_revoked: null }],
        },
        select: {
          id: true,
          user_id: true,
          is_revoked: true,
          expires_at: true,
          last_active_at: true,
        },
      });

      if (!session || !isSessionActive(session, payload.sub)) {
        await this.prisma.security_events.create({
          data: {
            user_id: payload.sub,
            event_type: 'REVOKED_TOKEN_USED',
            description: `Attempted use of a revoked or expired session from IP ${req.ip || 'unknown'}`,
            severity: 'high',
          },
        });
        throw new UnauthorizedException('Token has been revoked');
      }

      const lastActive = session.last_active_at
        ? new Date(session.last_active_at).getTime()
        : 0;
      if (!lastActive || Date.now() - lastActive > 5 * 60 * 1000) {
        await this.prisma.user_sessions
          .update({
            where: { id: session.id },
            data: { last_active_at: new Date() },
          })
          .catch(() => undefined);
      }
    }

    return {
      id: user.id,
      role: user.role,
      wallet_id: payload.wallet_id,
      jti: payload.jti,
    };
  }
}
