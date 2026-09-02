import { OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { RedisService } from '../redis/redis.service';
export declare class BullmqService implements OnModuleDestroy {
    private readonly redis;
    private readonly logger;
    private queues;
    private workers;
    constructor(redis: RedisService);
    private getRedisConnection;
    createQueue(name: string, opts?: Omit<QueueOptions, 'connection'>): Queue<any, any, string, any, any, string, import("bullmq").RedisQueueBackend>;
    createWorker(name: string, processor: any, opts?: Omit<WorkerOptions, 'connection'>): Worker<any, any, string, import("bullmq").RedisQueueBackend>;
    getQueue(name: string): Queue<any, any, string, any, any, string, import("bullmq").RedisQueueBackend> | null;
    closeAll(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
