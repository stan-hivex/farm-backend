import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

const logger = new Logger('FieldEncryption');

/**
 * Field-level encryption for sensitive data
 * Uses AES-256-GCM with authenticated encryption
 * Encryption key should be loaded from AWS Secrets Manager or environment
 */
export class FieldEncryption {
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(encryptionKeyHex: string) {
    if (!encryptionKeyHex) {
      throw new Error('Encryption key not provided');
    }

    // Validate key is 64 hex characters (32 bytes = 256 bits)
    if (encryptionKeyHex.length !== 64) {
      throw new Error('Encryption key must be 64 hex characters (256 bits)');
    }

    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
  }

  /**
   * Encrypt sensitive data
   * Returns format: "iv:tag:encrypted" (all hex-encoded)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return '';

    try {
      const iv = crypto.randomBytes(16); // 128-bit IV
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      // typings may not include getAuthTag; cast to any
      const tag = (cipher as any).getAuthTag();

      // Return encrypted value with IV and auth tag
      // Format: base64(iv:tag:encrypted) to keep it compact in DB
      const combined = Buffer.concat([iv, tag, encrypted]);
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Encryption error');
    }
  }

  /**
   * Decrypt sensitive data
   * Expects format: base64(iv:tag:encrypted)
   */
  decrypt(encrypted: string): string {
    if (!encrypted) return '';

    try {
      const combined = Buffer.from(encrypted, 'base64');

      // Extract components
      const iv = combined.slice(0, 16);
      const tag = combined.slice(16, 32);
      const ciphertext = combined.slice(32);

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      // typings may not include setAuthTag; cast to any
      (decipher as any).setAuthTag(tag);

      const decrypted = Buffer.concat([
        (decipher as any).update ? (decipher as any).update(ciphertext) : decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption error - data may be corrupted');
    }
  }

  /**
   * Static method to generate a secure encryption key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

/**
 * Singleton instance for use throughout app
 */
export let fieldEncryption: FieldEncryption;

export function initializeFieldEncryption(encryptionKeyHex: string) {
  fieldEncryption = new FieldEncryption(encryptionKeyHex);
  logger.log('✅ Field encryption initialized');
}
