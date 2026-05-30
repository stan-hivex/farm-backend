import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';

export const REQUIRE_API_KEY = 'requireApiKey';
export const RequireApiKey = () => SetMetadata(REQUIRE_API_KEY, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireApiKey = this.reflector.getAllAndOverride<boolean>(REQUIRE_API_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!requireApiKey) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) throw new UnauthorizedException('API key required');

    const key = await this.prisma.api_keys.findFirst({
      where: {
        api_key: apiKey,
        expires_at: { gt: new Date() },
      },
      include: { users: { select: { id: true, role: true, is_active: true } } },
    });

    if (!key || !key.users?.is_active) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Update last used timestamp
    await this.prisma.api_keys.update({
      where: { id: key.id },
      data: { last_used_at: new Date() },
    });

    // Attach user to request like JWT guard does
    request.user = { id: key.users.id, role: key.users.role };
    return true;
  }
}