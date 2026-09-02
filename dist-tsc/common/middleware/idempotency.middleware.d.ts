import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';
export declare class IdempotencyMiddleware implements NestMiddleware {
    private readonly redis?;
    private readonly logger;
    constructor(redis?: RedisService | undefined);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
}
