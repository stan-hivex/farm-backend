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
  /**
   * ─────────────────────────────────────────────
   * SAFE AWS SECRETS (NON-BLOCKING)
   * ─────────────────────────────────────────────
   */
  const useAws = process.env.USE_AWS_SECRETS_MANAGER === 'true';

  if (useAws) {
    try {
      await loadAwsSecrets();
      console.log('✅ AWS Secrets loaded');
    } catch (err) {
      console.warn('⚠️ AWS Secrets skipped:', err.message);
    }
  }

  /**
   * ─────────────────────────────────────────────
   * CREATE APP
   * ─────────────────────────────────────────────
   */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const config = app.get(ConfigService);

  /**
   * ─────────────────────────────────────────────
   * CORE RENDER REQUIREMENT
   * MUST USE process.env.PORT
   * ─────────────────────────────────────────────
   */
  const port = process.env.PORT || 3000;

  app.set('trust proxy', 1);

  /**
   * ─────────────────────────────────────────────
   * SECURITY
   * ─────────────────────────────────────────────
   */
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

  app.use((req, res, next) => {
    res.removeHeader('Server');
    next();
  });

  app.use(compression());

  /**
   * ─────────────────────────────────────────────
   * BODY PARSING
   * ─────────────────────────────────────────────
   */
  app.use(json({ limit: '10kb' }));
  app.use(urlencoded({ extended: true, limit: '10kb' }));

  /**
   * ─────────────────────────────────────────────
   * GLOBAL PREFIX + VERSIONING
   * ─────────────────────────────────────────────
   */
  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  /**
   * ─────────────────────────────────────────────
   * CORS
   * ─────────────────────────────────────────────
   */
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      // allow localhost in dev
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
  });

  /**
   * ─────────────────────────────────────────────
   * GLOBAL PIPELINES
   * ─────────────────────────────────────────────
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  /**
   * ─────────────────────────────────────────────
   * SWAGGER (DEV ONLY)
   * ─────────────────────────────────────────────
   */
  if (process.env.NODE_ENV !== 'production') {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('FARM / HiveXX API')
      .setDescription('Backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api/docs', app, document);
  }

  /**
   * ─────────────────────────────────────────────
   * START SERVER (RENDER SAFE)
   * ─────────────────────────────────────────────
   */
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on port ${port}`);
  console.log(`📚 API: /api/v1`);
}
bootstrap();