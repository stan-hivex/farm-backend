import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
type RedisClient = InstanceType<typeof Redis>;
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private client;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    initFromUrl(redisUrl: string): Promise<void>;
    getClient(): RedisClient | null;
    isHealthy(): Promise<boolean>;
    quit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
export {};
