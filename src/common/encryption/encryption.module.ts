import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeFieldEncryption, fieldEncryption } from './field-encryption';

const logger = new Logger('EncryptionModule');

@Global()
@Module({
  providers: [
    {
      provide: 'FIELD_ENCRYPTION',
      useFactory: (configService: ConfigService) => {
        const encryptionKey = configService.get<string>('FIELD_ENCRYPTION_KEY');
        const nodeEnv = configService.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';
        const isProduction = nodeEnv === 'production';

        let keyToUse = encryptionKey;
        if (!keyToUse) {
          keyToUse = require('crypto').randomBytes(32).toString('hex');
          process.env.FIELD_ENCRYPTION_KEY = keyToUse;
          logger.warn(
            isProduction
              ? '⚠️ FIELD_ENCRYPTION_KEY not configured; generated an ephemeral fallback for this process. Set it explicitly in production.'
              : '⚠️ FIELD_ENCRYPTION_KEY not configured; using temporary development key. Do not use in production.',
          );
        }

        initializeFieldEncryption(keyToUse as string);
        return fieldEncryption;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['FIELD_ENCRYPTION'],
})
export class EncryptionModule {}
