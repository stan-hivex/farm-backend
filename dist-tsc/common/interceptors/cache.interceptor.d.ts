import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CacheService } from '../cache/cache.service';
export declare class CacheInterceptor implements NestInterceptor {
    private readonly cacheService;
    private readonly logger;
    constructor(cacheService: CacheService);
    private buildCacheKey;
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
