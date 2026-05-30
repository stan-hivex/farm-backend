import {
  CanActivate, ExecutionContext, Injectable,
  BadRequestException, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';

export const REQUIRE_PIN_KEY = 'requirePin';
export const RequirePin = () => SetMetadata(REQUIRE_PIN_KEY, true);

@Injectable()
export class PinGuard implements CanActivate {
  constructor(private reflector: Reflector, private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirePin = this.reflector.getAllAndOverride<boolean>(REQUIRE_PIN_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!requirePin) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const pin = request.body?.pin;

    if (!pin) throw new BadRequestException('PIN is required for this action');

    // Delegates to AuthService which handles attempt counting and locking
    await this.authService.verifyPin(user.id, pin);
    return true;
  }
}