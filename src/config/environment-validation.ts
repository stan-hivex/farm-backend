import { Logger } from '@nestjs/common';

const logger = new Logger('EnvironmentValidation');

/**
 * Validates that all required security-critical environment variables are set.
 * Fails fast at startup to prevent running with weak/fallback secrets.
 * Called in main.ts before app.listen()
 */
export function validateSecurityEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production' || process.env.RENDER === 'true';

  const validateSecret = (secretName: string, minLength = 32) => {
    const currentValue = process.env[secretName];
    const isMissingOrWeak = !currentValue || currentValue.length < minLength || currentValue === 'farm-secret';

    if (!isMissingOrWeak) {
      return;
    }

    throw new Error(
      `Production security validation failed: ${secretName} must be set to a strong value (minimum ${minLength} characters).`,
    );
  };

  if (isProduction) {
    validateSecret('JWT_ACCESS_SECRET');
    validateSecret('JWT_REFRESH_SECRET');
    validateSecret('QR_HMAC_SECRET');
    validateSecret('FIELD_ENCRYPTION_KEY');

    if (!process.env.TURNSTILE_SECRET_KEY) {
      throw new Error('Production security validation failed: TURNSTILE_SECRET_KEY must be set (get from https://dash.cloudflare.com/).');
    }

    if (!process.env.DATABASE_URL) {
      throw new Error('Production security validation failed: DATABASE_URL must be set.');
    }
    if (!process.env.REDIS_URL && !(process.env.REDIS_HOST && process.env.REDIS_PORT)) {
      throw new Error(
        'Production security validation failed: REDIS_URL or REDIS_HOST and REDIS_PORT must be set.',
      );
    }

    logger.log('✅ Security environment validation completed.');
  } else {
    if (!process.env.JWT_ACCESS_SECRET) {
      logger.warn(
        '⚠️ JWT_ACCESS_SECRET not set - using development default. DO NOT use in production!',
      );
    }
    if (!process.env.QR_HMAC_SECRET) {
      logger.warn(
        '⚠️ QR_HMAC_SECRET not set - using development default. DO NOT use in production!',
      );
    }
    if (!process.env.FIELD_ENCRYPTION_KEY) {
      logger.warn(
        '⚠️ FIELD_ENCRYPTION_KEY not set - using temporary development key. DO NOT use in production!',
      );
    }
  }
}
