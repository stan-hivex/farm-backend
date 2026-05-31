import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';

import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { winstonConfig } from './common/logger/winston.config';
import { loadAwsSecrets } from './common/utils/aws-secrets-manager.util';

async function bootstrap() {
  const useAws = process.env.USE_AWS_SECRETS_MANAGER === 'true';

  // ✅ SAFE AWS LOADING (won’t crash deploy)
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

  // ── Trust proxy (Render / Load balancers)
  app.set('trust proxy', 1);

  // ── Security
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
        },
      },
    } as any),
  );

  app.use((req: any, res: any, next: any) => {
    res.removeHeader('Server');
    next();
  });

  app.use(compression());

  // ── Body parsing
  app.use(
    json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // ── Global prefix
  app.setGlobalPrefix('api');

  // ── Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('http://127.0.0.1')
        ) {
          return callback(null, true);
        }
      }

      const allowedOrigins = (config.get<string>('CORS_ORIGINS', '') || '')
        .split(',')
        .map((o) => o.trim());

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // ── Swagger (dev only)
  if (config.get('NODE_ENV') !== 'production') {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('FARM / HiveXX API')
      .setDescription('Backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api/docs', app, document);
  }

  // ── ✅ CRITICAL FIX FOR RENDER
  const port = parseInt(process.env.PORT || '3000', 10);

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();