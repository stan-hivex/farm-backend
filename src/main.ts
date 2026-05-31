import net from 'node:net';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { loadAwsSecrets } from './common/utils/aws-secrets-manager.util';

import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { winstonConfig } from './common/logger/winston.config';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      server.close();
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host: '0.0.0.0' });
  });
}

async function findOpenPort(startPort: number, maxRetries = 10): Promise<number> {
  for (let port = startPort; port < startPort + maxRetries; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${startPort + maxRetries - 1}`);
}

async function bootstrap() {
  const useAws = process.env.USE_AWS_SECRETS_MANAGER === 'true';

if (useAws) {
  try {
    await loadAwsSecrets();
  } catch (err) {
    console.warn('AWS Secrets Manager failed, continuing without it:', err);
  }
}

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const config = app.get(ConfigService);

  // ── Trust proxy for correct client IP address parsing behind proxies/load balancers
  app.set('trust proxy', 1);

  // ── Security headers ──────────────────────────────────────────────────────
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    originAgentCluster: true,
    // permissionsPolicy is not yet in Helmet's TS types in some versions
    // cast to `any` to avoid type errors while retaining runtime config
  } as any));
  app.use((req: any, res: any, next: any) => {
    res.removeHeader('Server');
    next();
  });
  app.use(compression());

  // ── Raw body capture — MUST come before json() middleware ─────────────────
  // Required for Paystack/Ivorypay webhook signature verification
  app.use((req: any, res: any, next: any) => {
    json({
      limit: '10kb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    })(req, res, next);
  });
  app.use(urlencoded({ extended: true, limit: '10kb' }));

  // ── Versioning & prefix ───────────────────────────────────────────
  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const allowedOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // ── CORS ───────────────────────────────────────────────────────────
 app.enableCors({
  origin: (origin, callback) => {
    // allow tools like Postman / mobile apps
    if (!origin) return callback(null, true);

    // ALWAYS allow localhost in development (fixes Flutter random ports)
    if (process.env.NODE_ENV !== 'production') {
      if (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        return callback(null, true);
      }
    }

    // production whitelist (optional)
    const allowedOrigins = (config.get<string>('CORS_ORIGINS', '') || '')
      .split(',')
      .map(o => o.trim());

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`), false);
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

  // ── Global validation ─────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );


  // ── Global filters & interceptors ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  // ── Swagger ───────────────────────────────────────────────────────────────
  if (config.get('NODE_ENV') !== 'production') {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('FARM / HiveXX API')
      .setDescription('Complete backend API for the FARM token ecosystem')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'ApiKey')
      .addTag('Auth').addTag('Wallet').addTag('Transactions').addTag('Escrow')
      .addTag('QR').addTag('Merchants').addTag('Investments').addTag('Blockchain')
      .addTag('Payments').addTag('KYC').addTag('Notifications').addTag('Users').addTag('Admin')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const requestedPort = config.get<number>('PORT', 3000);
  const port = requestedPort === 0 ? 0 : await findOpenPort(requestedPort, 10);

  if (port !== requestedPort && requestedPort !== 0) {
    console.warn(`⚠️  Port ${requestedPort} was unavailable, falling back to ${port}`);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`\n🚀  FARM Backend listening on http://localhost:${port}/api/v1`);
  console.log(`📚  Swagger UI:            http://localhost:${port}/api/docs\n`);
}
bootstrap();