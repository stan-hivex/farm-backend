import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(private readonly cacheService: CacheService) {}

  private buildCacheKey(req: Request) {
    const authHeader = req.headers.authorization ?? '';
    const authHash = authHeader
      ? createHash('sha256').update(authHeader).digest('hex')
      : 'anonymous';
    return `http:${req.method}:${req.originalUrl}:${authHash}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!['GET', 'HEAD'].includes(req.method)) {
      return next.handle();
    }

    const key = this.buildCacheKey(req);

    return new Observable((subscriber) => {
      this.cacheService.get<{ status: number; body: any }>(key).then((cached) => {
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          res.status(cached.status);
          subscriber.next(cached.body);
          subscriber.complete();
          return;
        }

        next
          .handle()
          .pipe(
            tap((payload) => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                void this.cacheService.set(key, { status: res.statusCode, body: payload });
                res.setHeader('X-Cache', 'MISS');
              }
            }),
          )
          .subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
      }).catch((error) => {
        this.logger.warn(`Cache lookup failed for key ${key}: ${error}`);
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
