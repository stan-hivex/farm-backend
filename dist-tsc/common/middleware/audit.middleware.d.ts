import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';
export declare class AuditMiddleware implements NestMiddleware {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    use(req: Request, res: Response, next: NextFunction): void;
    private sanitize;
}
