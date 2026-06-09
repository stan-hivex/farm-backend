import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class KycGuard implements CanActivate {
  canActivate(_context: ExecutionContext) {
    return true;
  }
}
