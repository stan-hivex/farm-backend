import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, QueueOptions, WorkerOptions, ConnectionOptions } from 'bullmq';
import { buildRedisConnectionConfig } from './redis.module';

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly connection: ConnectionOptions | string;

  constructor(private readonly cfg: ConfigService) {
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    this.connection = buildRedisConnectionConfig(cfg, isProduction) as any;
  }

  getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, { connection: this.connection as any });
      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  async add(queueName: string, data: unknown, opts?: any, jobName = 'default') {
    const queue = this.getQueue(queueName);
    return queue.add(jobName, data, opts);
  }

  async getJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string) {
    const job = await this.getJob(queueName, jobId);
    return job ? job.remove() : null;
  }

  createWorker(queueName: string, processor: (job: Job) => Promise<any>, opts?: WorkerOptions) {
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
