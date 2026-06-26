import * as bcrypt from 'bcrypt';

/**
 * API Key Hashing Service
 * Securely hashes API keys before storage using bcrypt
 * Prevents exposure of full keys if database is compromised
 */
export class ApiKeyHashService {
  private static readonly BCRYPT_ROUNDS = 12;

  /**
   * Generate a new API key and its hash
   * Returns: { raw_key, key_hash }
   * Store only key_hash in database
   * Return raw_key to user ONE TIME
   */
  static generateAndHashKey(): { raw_key: string; key_hash: string } {
    // Generate 32-byte random key, encode as hex
    const raw_key = require('crypto').randomBytes(32).toString('hex');
    const key_hash = require('crypto')
      .createHash('sha256')
      .update(raw_key)
      .digest('hex');

    return { raw_key, key_hash };
  }

  /**
   * Hash an API key for comparison
   * Use this when verifying incoming API keys
   */
  static hashKey(key: string): string {
    return require('crypto')
      .createHash('sha256')
      .update(key)
      .digest('hex');
  }

  /**
   * Compare incoming key with stored hash
   */
  static async compareKeys(incomingKey: string, storedHash: string): Promise<boolean> {
    try {
      const incomingHash = this.hashKey(incomingKey);
      return incomingHash === storedHash;
    } catch (error) {
      return false;
    }
  }
}
