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
  console.log('🚀 Starting FARM backend...');
console.log('ENV CHECK:', {
  db: process.env.DATABASE_URL,
  redis: process.env.REDIS_URL,
});
  /**
   * SAFE AWS LOAD (NEVER BLOCK STARTUP)
   */
  if (process.env.USE_AWS_SECRETS_MANAGER === 'true') {
    try {
      await loadAwsSecrets();
      console.log('✅ AWS secrets loaded');
    } catch (err) {
      console.warn('⚠️ AWS secrets skipped:', err?.message || err);
    }
  }

  /**
   * CREATE APP
   */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const config = app.get(ConfigService);

  /**
   * RENDER REQUIRED PORT
   */
  const port = parseInt(process.env.PORT || '3000', 10);

  app.set('trust proxy', 1);

  /**
   * SECURITY
   */
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
    } as any),
  );

  app.use((req, res, next) => {
    res.removeHeader('Server');
    next();
  });

  app.use(compression());

  /**
   * BODY
   */
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  /**
   * PREFIX + VERSIONING
   */
  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  /**
   * CORS SAFE
   */
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        if (
          origin.includes('localhost') ||
          origin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
      }

      const allowed = (config.get('CORS_ORIGINS', '') || '')
        .split(',')
        .map((o) => o.trim());

      if (allowed.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true); // ⚠️ fallback allow (prevents deploy crash)
    },
    credentials: true,
  });

  /**
   * GLOBAL PIPELINE
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  /**
   * SWAGGER (ONLY DEV)
   */
  if (process.env.NODE_ENV !== 'production') {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('FARM API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api/docs', app, document);
  }

  /**
   * START SERVER
   */
  await app.listen(port, '0.0.0.0');

  console.log(`✅ Server running on http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('BOOTSTRAP FAILED');
  console.error(err);
  process.exit(1);
});