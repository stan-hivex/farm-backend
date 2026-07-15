import cluster from 'cluster';
import { cpus } from 'os';
import * as express from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateSecurityEnvironment } from './config/environment-validation';
import { SafeInputValidationPipe } from './common/pipes/safe-input.pipe';

async function bootstrap() {
  // SECURITY FIRST: Validate all security-critical environment variables
  // This runs BEFORE creating the app to fail fast if secrets are missing
  validateSecurityEnvironment();
  const app = await NestFactory.create(AppModule);

  const rawBodySaver = (req: express.Request, res: express.Response, buf: Buffer, encoding: string) => {
    if (buf && buf.length) {
      const enc = (encoding as BufferEncoding) ?? 'utf8';
      (req as any).rawBody = buf.toString(enc);
    }
  };

  app.use(express.json({ verify: rawBodySaver }));
  app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.set('trust proxy', true);
    app.use(
      helmet({
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      }),
    );
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
      if (req.secure || forwardedProto === 'https') {
        return next();
      }
      const host = req.headers.host;
      if (!host) {
        return next();
      }
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    });
  } else {
    app.use(helmet());
  }

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const configService = app.get(ConfigService);
  const configuredCorsOrigins = [
    configService.get<string>('CORS_ORIGINS'),
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('APP_URL'),
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean));

  const corsOrigins = [...new Set(configuredCorsOrigins)];

  const localhostCorsRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  if (isProduction && corsOrigins?.includes('*')) {
    Logger.warn(
      'CORS_ORIGINS contains "*" in production. Wildcard origins are disabled for security.',
      'Bootstrap',
    );
  }

  const corsOriginMatches = (origin: string) => {
    if (!corsOrigins?.length) {
      return false;
    }

    return corsOrigins.some((allowedOrigin) => {
      if (allowedOrigin === '*') {
        return !isProduction;
      }

      if (allowedOrigin.startsWith('*.')) {
        return origin.endsWith(allowedOrigin.slice(1));
      }

      if (allowedOrigin.includes('*')) {
        const escaped = allowedOrigin.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
        return pattern.test(origin);
      }

      return origin === allowedOrigin;
    });
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (corsOriginMatches(origin)) {
        return callback(null, true);
      }

      if (localhostCorsRegex.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true,
  });

  // Explicitly handle OPTIONS preflight requests so Cloudflare and browsers
  // receive a quick successful response. CORS headers are provided by the
  // cors middleware registered via `enableCors` above.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
      return res.sendStatus(204);
    }
    return next();
  });

  app.useGlobalPipes(
    new SafeInputValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = Number(process.env.PORT || configService.get<number>('PORT') || 3000);

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL'];
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    Logger.warn(
      `⚠️ Missing environment variables: ${missingEnvVars.join(', ')}`,
      'Bootstrap',
    );
    Logger.warn(
      'On Render.com: Connect a PostgreSQL database in the Render dashboard',
      'Bootstrap',
    );
  }

  try {
    await app.listen(port);
    Logger.log(
      `✅ Application is running on: ${await app.getUrl()}`,
      'Bootstrap',
    );
    Logger.log(
      `🔗 API: ${await app.getUrl()}/api/v1`,
      'Bootstrap',
    );
    Logger.log(
      `💚 Health check: ${await app.getUrl()}/api/v1/health`,
      'Bootstrap',
    );
  } catch (error) {
    if ((error as any)?.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      Logger.warn(`Port ${port} is already in use. Trying ${fallbackPort} instead.`, 'Bootstrap');
      await app.listen(fallbackPort);
      Logger.log(
        `✅ Application is running on: ${await app.getUrl()}`,
        'Bootstrap',
      );
    } else {
      Logger.error(
        `❌ Failed to start application: ${error instanceof Error ? error.message : String(error)}`,
        (error as any)?.stack,
        'Bootstrap',
      );
      Logger.error(
        'Debug info: Check DATABASE_URL, REDIS_URL, and other environment variables',
        'Bootstrap',
      );
      process.exit(1);
    }
  }
}

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  const workerCount = Number(process.env.WEB_CONCURRENCY) || cpus().length;
  const logger = new Logger('Cluster');

  logger.log(`Master process started. Forking ${workerCount} workers.`);

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} exited with code ${code} signal ${signal}. Restarting...`);
    cluster.fork();
  });
} else {
  bootstrap();
}
