import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const rawBodySaver = (req: express.Request, res: express.Response, buf: Buffer, encoding: string) => {
    if (buf && buf.length) {
      const enc = (encoding as BufferEncoding) ?? 'utf8';
      (req as any).rawBody = buf.toString(enc);
    }
  };

  app.use(express.json({ verify: rawBodySaver }));
  app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const configService = app.get(ConfigService);
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const localhostCorsRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (corsOrigins?.includes(origin)) {
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
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT || configService.get<number>('PORT') || 3000);

  try {
    await app.listen(port);
  } catch (error) {
    if ((error as any)?.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      Logger.warn(`Port ${port} is already in use. Trying ${fallbackPort} instead.`, 'Bootstrap');
      await app.listen(fallbackPort);
    } else {
      Logger.error('Failed to start application', error as any, 'Bootstrap');
      process.exit(1);
    }
  }

  Logger.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap');
}

bootstrap();
