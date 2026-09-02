"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cluster_1 = __importDefault(require("cluster"));
const os_1 = require("os");
const express = __importStar(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const environment_validation_1 = require("./config/environment-validation");
const safe_input_pipe_1 = require("./common/pipes/safe-input.pipe");
async function bootstrap() {
    (0, environment_validation_1.validateSecurityEnvironment)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const rawBodySaver = (req, res, buf, encoding) => {
        if (buf && buf.length) {
            const enc = encoding ?? 'utf8';
            req.rawBody = buf.toString(enc);
        }
    };
    app.use(express.json({ verify: rawBodySaver }));
    app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
        const expressApp = app.getHttpAdapter().getInstance();
        expressApp.set('trust proxy', true);
        app.use((0, helmet_1.default)({
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
        }));
        app.use((req, res, next) => {
            const forwardedProto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim();
            if (req.secure || forwardedProto === 'https') {
                return next();
            }
            const host = req.headers.host;
            if (!host) {
                return next();
            }
            return res.redirect(301, `https://${host}${req.originalUrl}`);
        });
    }
    else {
        app.use((0, helmet_1.default)());
    }
    app.setGlobalPrefix('api');
    app.enableVersioning({
        type: common_1.VersioningType.URI,
        defaultVersion: '1',
    });
    const configService = app.get(config_1.ConfigService);
    const configuredCorsOrigins = [
        configService.get('CORS_ORIGINS'),
        configService.get('FRONTEND_URL'),
        configService.get('APP_URL'),
    ]
        .filter((value) => Boolean(value))
        .flatMap((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean));
    const corsOrigins = [...new Set(configuredCorsOrigins)];
    const localhostCorsRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (isProduction && corsOrigins?.includes('*')) {
        common_1.Logger.warn('CORS_ORIGINS contains "*" in production. Wildcard origins are disabled for security.', 'Bootstrap');
    }
    const corsOriginMatches = (origin) => {
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
    app.use((req, res, next) => {
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
            return res.sendStatus(204);
        }
        return next();
    });
    app.useGlobalPipes(new safe_input_pipe_1.SafeInputValidationPipe(), new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const port = Number(process.env.PORT || configService.get('PORT') || 3000);
    const requiredEnvVars = ['DATABASE_URL'];
    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
        common_1.Logger.warn(`⚠️ Missing environment variables: ${missingEnvVars.join(', ')}`, 'Bootstrap');
        common_1.Logger.warn('On Render.com: Connect a PostgreSQL database in the Render dashboard', 'Bootstrap');
    }
    try {
        await app.listen(port);
        common_1.Logger.log(`✅ Application is running on: ${await app.getUrl()}`, 'Bootstrap');
        common_1.Logger.log(`🔗 API: ${await app.getUrl()}/api/v1`, 'Bootstrap');
        common_1.Logger.log(`💚 Health check: ${await app.getUrl()}/api/v1/health`, 'Bootstrap');
    }
    catch (error) {
        if (error?.code === 'EADDRINUSE') {
            const fallbackPort = port + 1;
            common_1.Logger.warn(`Port ${port} is already in use. Trying ${fallbackPort} instead.`, 'Bootstrap');
            await app.listen(fallbackPort);
            common_1.Logger.log(`✅ Application is running on: ${await app.getUrl()}`, 'Bootstrap');
        }
        else {
            common_1.Logger.error(`❌ Failed to start application: ${error instanceof Error ? error.message : String(error)}`, error?.stack, 'Bootstrap');
            common_1.Logger.error('Debug info: Check DATABASE_URL and other environment variables', 'Bootstrap');
            process.exit(1);
        }
    }
}
const clusteringEnabled = process.env.ENABLE_CLUSTER === 'true';
if (cluster_1.default.isPrimary && process.env.NODE_ENV === 'production' && clusteringEnabled) {
    const workerCount = Number(process.env.WEB_CONCURRENCY) || (0, os_1.cpus)().length;
    const logger = new common_1.Logger('Cluster');
    logger.log(`Master process started. Forking ${workerCount} workers.`);
    for (let i = 0; i < workerCount; i += 1) {
        cluster_1.default.fork();
    }
    cluster_1.default.on('exit', (worker, code, signal) => {
        const reason = signal
            ? `signal ${signal}`
            : `code ${code}${worker.exitedAfterDisconnect ? ' after disconnect' : ''}`;
        logger.error(`Worker ${worker.process.pid} exited with ${reason}. A replacement worker will be started.`);
        cluster_1.default.fork();
    });
}
else {
    bootstrap().catch((error) => {
        const logger = new common_1.Logger('Bootstrap');
        logger.error(`Fatal application startup error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=main.js.map