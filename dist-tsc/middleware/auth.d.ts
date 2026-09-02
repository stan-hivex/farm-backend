import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: any;
}
export declare const authenticateUser: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
