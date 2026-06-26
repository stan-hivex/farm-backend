import { Logger } from '@nestjs/common';

const logger = new Logger('EnvironmentValidation');

/**
 * Validates that all required security-critical environment variables are set.
 * Fails fast at startup to prevent running with weak/fallback secrets.
 * Called in main.ts before app.listen()
 */
export function validateSecurityEnvironment() {
  const requiredSecrets = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'QR_HMAC_SECRET',
    'FIELD_ENCRYPTION_KEY',
    'DATABASE_URL',
    'REDIS_URL',
  ];

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // In production, all secrets MUST be set
  if (isProduction) {
    const missing = requiredSecrets.filter(secret => !process.env[secret]);
    if (missing.length > 0) {
      logger.error(`🚨 CRITICAL: Missing required environment variables in production:`);
      missing.forEach(secret => logger.error(`   - ${secret}`));
      process.exit(1);
    }

    // Validate secret strength (production)
    const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || '';
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
    const qrHmacSecret = process.env.QR_HMAC_SECRET || '';

    if (jwtAccessSecret.length < 32) {
      logger.error('🚨 JWT_ACCESS_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (jwtRefreshSecret.length < 32) {
      logger.error('🚨 JWT_REFRESH_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (qrHmacSecret.length < 32) {
      logger.error('🚨 QR_HMAC_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (qrHmacSecret === 'farm-secret') {
      logger.error('🚨 QR_HMAC_SECRET must not be the default value in production');
      process.exit(1);
    }

    logger.log('✅ All security environment variables validated in production');
  } else {
    // In development, warn if using defaults (but allow for local testing)
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
