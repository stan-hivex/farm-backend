import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

type RedisClient = InstanceType<typeof Redis>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;

  constructor() {}

  async initFromUrl(redisUrl: string): Promise<void> {
    if (!redisUrl) throw new Error('REDIS_URL is required');

    try {
      const url = new URL(redisUrl);
      const isTls = url.protocol === 'rediss:';

      const opts: any = {
        // Allow ioredis to parse the URL, but also pass TLS when needed
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        // sensible defaults
        connectTimeout: 10000,
      };

      if (isTls) {
        opts.tls = { servername: url.hostname };
      }

      this.client = new Redis(redisUrl, opts);

      this.client.on('error', (err: Error) => {
        this.logger.error(`Redis error: ${err?.message}`);
      });

      this.client.on('connect', () => this.logger.log('Redis connecting...'));
      this.client.on('ready', () => this.logger.log('Redis ready'));
      this.client.on('close', () => this.logger.warn('Redis connection closed'));

      // Lightweight health check
      const pong = await this.client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response from Redis: ${String(pong)}`);
      }

      this.logger.log(`Redis connection established to ${url.hostname} (TLS: ${isTls})`);
    } catch (error) {
      this.logger.error('Failed to initialize Redis client', error as any);
      // bubble up so application start fails when REDIS_URL invalid/unavailable
      throw error;
    }
  }

  getClient(): RedisClient | null {
    return this.client;
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client) return false;
      const r = await this.client.ping();
      return r === 'PONG';
    } catch (e) {
      return false;
    }
  }

  async quit(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
    } catch (e) {
      this.logger.warn('Error quitting Redis client', e as any);
    }
  }

  async onModuleDestroy() {
    await this.quit();
  }
}
