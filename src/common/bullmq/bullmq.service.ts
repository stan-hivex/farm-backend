import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  constructor(private readonly redis: RedisService) {}

  createQueue(name: string, opts?: QueueOptions) {
    const connection = opts?.connection ?? { url: process.env.REDIS_URL };
    const q = new Queue(name, { ...opts, connection });
    this.queues.set(name, q);
    this.logger.log(`Created queue ${name}`);
    return q;
  }

  createWorker(name: string, processor: any, opts?: WorkerOptions) {
    const connection = opts?.connection ?? { url: process.env.REDIS_URL };
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
