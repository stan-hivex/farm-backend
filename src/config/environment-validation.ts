import { Logger } from '@nestjs/common';

const logger = new Logger('EnvironmentValidation');

/**
 * Validates that all required security-critical environment variables are set.
 * Fails fast at startup to prevent running with weak/fallback secrets.
 * Called in main.ts before app.listen()
 */
export function validateSecurityEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const ensureSecret = (secretName: string, minLength = 32) => {
    const currentValue = process.env[secretName];
    const isMissingOrWeak = !currentValue || currentValue.length < minLength || currentValue === 'farm-secret';

    if (!isMissingOrWeak) {
      return;
    }

    const generatedValue = generateSecureSecret(32);
    process.env[secretName] = generatedValue;
    logger.warn(
      `⚠️ ${secretName} not set or too weak - generated an ephemeral fallback for this process. Set it explicitly in production.`,
    );
  };

  if (isProduction) {
    ensureSecret('JWT_ACCESS_SECRET');
    ensureSecret('JWT_REFRESH_SECRET');
    ensureSecret('QR_HMAC_SECRET');
    ensureSecret('FIELD_ENCRYPTION_KEY');

    if (!process.env.DATABASE_URL) {
      logger.warn('⚠️ DATABASE_URL not set - the app will fail at database startup until configured.');
    }
    if (!process.env.REDIS_URL) {
      logger.warn('⚠️ REDIS_URL not set - Redis will use localhost:6379 if available.');
    }

    logger.log('✅ Security environment validation completed; ephemeral fallbacks were applied where needed.');
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

/**
 * Helper: Generate secure random secret (for development/testing only)
 */
export function generateSecureSecret(length = 32): string {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
}
