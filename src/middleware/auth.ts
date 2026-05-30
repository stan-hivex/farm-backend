import { Request, Response, NextFunction } from 'express';
import { UnauthorizedException } from '@nestjs/common';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticateUser = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  // This middleware assumes passport JWT middleware will attach user to req
  // If no user is found, throw Unauthorized
  if (!req.user) {
    throw new UnauthorizedException('No authorization token provided');
  }
  next();
};
