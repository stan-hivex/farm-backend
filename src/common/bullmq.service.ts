import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, WorkerOptions, ConnectionOptions } from 'bullmq';
import { buildRedisConnectionConfig } from './redis.module';

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly connection: ConnectionOptions | string | null;

  constructor(private readonly cfg: ConfigService) {
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    this.connection = buildRedisConnectionConfig(cfg, isProduction) as ConnectionOptions | string | null;
  }

  private isEnabled() {
    return !!this.connection;
  }

  getQueue(queueName: string): Queue | null {
    if (!this.isEnabled()) {
      return null;
    }

    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, { connection: this.connection as any });
      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  async add(queueName: string, data: unknown, opts?: any, jobName = 'default') {
    if (!this.isEnabled()) {
      this.logger.warn('BullMQ add skipped because no Redis connection is configured.');
      return null;
    }

    const queue = this.getQueue(queueName);
    return queue ? queue.add(jobName, data, opts) : null;
  }

  async getJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    return queue ? queue.getJob(jobId) : null;
  }

  async removeJob(queueName: string, jobId: string) {
    const job = await this.getJob(queueName, jobId);
    return job ? job.remove() : null;
  }

  createWorker(queueName: string, processor: (job: Job) => Promise<any>, opts?: WorkerOptions) {
    if (!this.isEnabled()) {
      return null;
    }

    if (this.workers.has(queueName)) {
      return this.workers.get(queueName)!;
    }

    const worker = new Worker(queueName, processor, {
      connection: this.connection as any,
      ...opts,
    });
    this.workers.set(queueName, worker);
    return worker;
  }

  async onModuleDestroy() {
    await Promise.all([
      ...Array.from(this.queues.values()).map((queue) => queue.close()),
      ...Array.from(this.workers.values()).map((worker) => worker.close()),
    ]);
  }
}
