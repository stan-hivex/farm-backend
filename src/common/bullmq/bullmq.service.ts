import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, QueueOptions, WorkerOptions, ConnectionOptions } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  constructor(private readonly redis: RedisService) {}

  private getRedisConnection(opts?: Omit<QueueOptions, 'connection'> | Omit<WorkerOptions, 'connection'>): ConnectionOptions {
    if (opts && 'connection' in opts && opts.connection) {
      return opts.connection;
    }

    const client = this.redis.getClient();
    if (!client) {
      throw new Error('Redis client is not initialized. Ensure REDIS_URL is configured and reachable.');
    }

    return client;
  }

  createQueue(name: string, opts?: Omit<QueueOptions, 'connection'>) {
    const connection = this.getRedisConnection(opts);
    const q = new Queue(name, { ...opts, connection });
    this.queues.set(name, q);
    this.logger.log(`Created queue ${name}`);
    return q;
  }

  createWorker(name: string, processor: any, opts?: Omit<WorkerOptions, 'connection'>) {
    const connection = this.getRedisConnection(opts);
    const w = new Worker(name, processor, { ...opts, connection });
    this.workers.set(name, w);
    this.logger.log(`Created worker ${name}`);
    return w;
  }

  getQueue(name: string) {
    return this.queues.get(name) ?? null;
  }

  async closeAll() {
    for (const [name, w] of this.workers.entries()) {
      try {
        await w.close();
        this.logger.log(`Closed worker ${name}`);
      } catch (e) {
        this.logger.warn(`Error closing worker ${name}`, e as any);
      }
    }

    for (const [name, q] of this.queues.entries()) {
      try {
        await q.close();
        this.logger.log(`Closed queue ${name}`);
      } catch (e) {
        this.logger.warn(`Error closing queue ${name}`, e as any);
      }
    }
  }

  async onModuleDestroy() {
    await this.closeAll();
  }
}
