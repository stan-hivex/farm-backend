import type { FarmApiContext } from '../../business-api/api-key-auth.guard';
/**
 * Shape of `request.user` set by JwtStrategy.validate() and returned by the
 * @CurrentUser() decorator. Type-only; no runtime effect.
 */
export interface AuthUser {
  id: string;
  role: string;
  wallet_id?: string;
  jti?: string;
}

import type { Request } from 'express';

/** Express request after the JWT guard has populated `user`. Type-only. */
export type AuthRequest = Request & { user: AuthUser };

/** Request after ApiKeyAuthGuard has attached the business API context. */
export type FarmApiRequest<C = FarmApiContext> = Request & { farmApi: C };
