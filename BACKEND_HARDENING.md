# Backend Security & Testing Hardening Guide

This guide provides concrete, actionable steps to make your NestJS backend production-ready.

## 1. Environment Variable Validation (30 min)

Create `src/config/environment.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';

export interface EnvironmentConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PAYSTACK_SECRET_KEY: string;
  IVORYPAY_SECRET: string;
  REDIS_URL: string;
  WEBHOOK_SECRET: string;
  NODE_ENV: 'development' | 'staging' | 'production';
  LOG_LEVEL: string;
}

export const validateEnvironment = (): EnvironmentConfig => {
  const required: (keyof EnvironmentConfig)[] = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PAYSTACK_SECRET_KEY',
    'IVORYPAY_SECRET',
    'REDIS_URL',
    'WEBHOOK_SECRET',
    'NODE_ENV',
  ];

  const errors: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Validate JWT_SECRET length (min 32 chars)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  // Validate NODE_ENV
  if (!['development', 'staging', 'production'].includes(process.env.NODE_ENV || '')) {
    errors.push('NODE_ENV must be development, staging, or production');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY!,
    IVORYPAY_SECRET: process.env.IVORYPAY_SECRET!,
    REDIS_URL: process.env.REDIS_URL!,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
    NODE_ENV: (process.env.NODE_ENV || 'development') as any,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
};
```

Update `src/main.ts`:

```typescript
import { validateEnvironment } from './config/environment';

async function bootstrap() {
  // Validate environment FIRST, before creating app
  validateEnvironment();

  const app = await NestFactory.create(AppModule);
  // ... rest of setup
}
```

## 2. Add Request Timeout Middleware (1 hour)

Create `src/common/middleware/timeout.middleware.ts`:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly REQUEST_TIMEOUT_MS = 30 * 1000; // 30 seconds

  use(req: Request, res: Response, next: NextFunction) {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          statusCode: 408,
          message: 'Request Timeout',
          error: 'TIMEOUT',
        });
      }
    }, this.REQUEST_TIMEOUT_MS);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timeoutId));
    res.on('close', () => clearTimeout(timeoutId));

    next();
  }
}
```

Register in `src/app.module.ts`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TimeoutMiddleware).forRoutes('*');
  }
}
```

## 3. Implement Graceful Shutdown (1.5 hours)

Update `src/main.ts`:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ... other setup ...

  const server = await app.listen(3000);

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new requests
    server.close(async () => {
      console.log('HTTP server closed');
      
      // Cleanup resources
      const prisma = app.get(PrismaService);
      await prisma.$disconnect();
      console.log('Database disconnected');
      
      // Close Redis connections
      try {
        const redis = app.get('REDIS_CLIENT');
        if (redis) await redis.quit();
        console.log('Redis disconnected');
      } catch (e) {
        console.warn('Redis disconnect error:', e);
      }
      
      // Close Bull queues
      const bullModule = app.get(BullModule);
      if (bullModule) await bullModule.close();
      console.log('Bull queues closed');
      
      console.log('Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30 * 1000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
```

## 4. Add Comprehensive E2E Tests (4-6 hours)

Create `test/e2e/critical-paths.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Critical Paths (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication Flow', () => {
    it('should register new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `test+${Date.now()}@example.com`,
          password: 'SecurePassword123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      userId = response.body.user.id;
      token = response.body.accessToken;
    });

    it('should login existing user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'existing@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      token = response.body.accessToken;
    });

    it('should refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      token = response.body.accessToken;
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('Deposit Flow', () => {
    it('should create deposit', async () => {
      const response = await request(app.getHttpServer())
        .post('/deposits')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 10000,
          currency: 'NGN',
          paymentMethod: 'paystack',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('pending');
    });

    it('should list user deposits', async () => {
      const response = await request(app.getHttpServer())
        .get('/deposits')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit', async () => {
      // Make 21 requests (limit is 20)
      for (let i = 0; i < 21; i++) {
        const response = await request(app.getHttpServer())
          .get('/health')
          .set('X-Forwarded-For', '192.168.1.100');

        if (i < 20) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(429); // Too Many Requests
        }
      }
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });
  });
});
```

Create `test/e2e/webhook-processing.e2e-spec.ts`:

```typescript
describe('Webhook Processing (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  describe('Paystack Webhooks', () => {
    it('should process charge.success webhook', async () => {
      const payload = {
        event: 'charge.success',
        data: {
          reference: 'ref_' + Date.now(),
          amount: 1000000,
          status: 'success',
          metadata: { userId: 'user123' },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('received');
      expect(response.body.received).toBe(true);
    });

    it('should reject replay attacks', async () => {
      const payload = {
        event: 'charge.success',
        data: {
          reference: 'replay_test_' + Date.now(),
          amount: 1000000,
        },
      };

      // First request should succeed
      await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .send(payload)
        .expect(200);

      // Second identical request should be rejected
      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true); // Accepted but not processed
    });

    it('should reject invalid signature', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('X-Paystack-Signature', 'invalid_signature')
        .send({ event: 'charge.success', data: {} })
        .expect(401);
    });
  });
});
```

## 5. Add Monitoring with Sentry (2 hours)

Install:

```bash
npm install @sentry/nestjs @sentry/tracing
```

Add to `src/main.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';

async function bootstrap() {
  // Initialize Sentry BEFORE creating app
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Postgres({ tracing: true }),
    ],
  });

  const app = await NestFactory.create(AppModule);

  // Use Sentry middleware
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.errorHandler());

  // ... rest of setup
}
```

Add to `src/app.module.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';

@Module({
  imports: [
    // ... other imports
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: 'SENTRY',
      useValue: Sentry,
    },
  ],
})
export class AppModule {}
```

Capture exceptions:

```typescript
import * as Sentry from '@sentry/nestjs';

try {
  // risky code
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'payments',
      webhook_provider: 'paystack',
    },
    extra: {
      userId: 'user123',
      paymentAmount: 10000,
    },
  });
}
```

## 6. Add Prometheus Metrics (2 hours)

Install:

```bash
npm install prom-client @nestjs/terminus
```

Create `src/common/metrics/prometheus.ts`:

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 30, 100, 300, 1000, 3000],
});

export const paymentProcessingTime = new Histogram({
  name: 'payment_processing_time_ms',
  help: 'Time to process payment in ms',
  labelNames: ['provider', 'status'],
  buckets: [100, 500, 1000, 5000, 10000],
});

export const failedWebhooks = new Counter({
  name: 'failed_webhooks_total',
  help: 'Total number of failed webhooks',
  labelNames: ['provider', 'event_type'],
});

export const redisConnected = new Gauge({
  name: 'redis_connected',
  help: 'Redis connection status (1=connected, 0=disconnected)',
});

export const queueDepth = new Gauge({
  name: 'webhook_queue_depth',
  help: 'Number of webhooks waiting to be processed',
});
```

Create metrics controller:

```typescript
@Controller('metrics')
export class MetricsController {
  @Get()
  getMetrics() {
    return register.metrics();
  }
}
```

Update services to track metrics:

```typescript
@Injectable()
export class PaystackService {
  async processPayment(amount: number) {
    const start = Date.now();
    try {
      // process payment
      const duration = Date.now() - start;
      paymentProcessingTime.labels('paystack', 'success').observe(duration);
    } catch (error) {
      failedWebhooks.labels('paystack', 'charge.success').inc();
      throw error;
    }
  }
}
```

---

## Testing Checklist

Run these before deployment:

```bash
# Run all tests
npm run test

# Check coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Build for production
npm run build

# Verify environment
npm run start:prod -- --dry-run
```

Expected output:
- ✅ All tests passing
- ✅ Coverage ≥ 50%
- ✅ No linting errors
- ✅ Build succeeds
- ✅ Environment validation passes

---

## Deployment Commands

```bash
# Build Docker image
docker build -f Dockerfile.production -t farm-backend:latest .

# Push to registry
docker push farm-backend:latest

# Deploy to production
docker-compose -f docker-compose.production.yml up -d

# Verify deployment
curl http://localhost:3000/health

# Monitor logs
docker-compose logs -f api
```

---

## Key Metrics to Monitor

After deployment, watch:

- **Payment Success Rate**: Should be > 99%
- **API Latency p95**: Should be < 500ms
- **Error Rate**: Should be < 0.1%
- **Webhook Processing Lag**: Should be < 10 seconds
- **Database Connection Pool**: Should be < 20 active connections
- **Redis Memory**: Should be < 500MB

Alert if any metric is outside normal range for more than 5 minutes.
