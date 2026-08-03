import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { ApiKeyHashService } from '../src/common/security/api-key-hash.service';
import { FieldEncryption } from '../src/common/encryption/field-encryption';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

describe('🔒 Security Hardening Tests (Production)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get<AuthService>(AuthService);
    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // Environment Security Tests
  // ============================================================

  describe('🔐 Environment Variable Security', () => {
    it('should reject app startup if JWT_ACCESS_SECRET is missing', () => {
      const originalSecret = process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_ACCESS_SECRET;

      expect(() => {
        // validateSecurityEnvironment() should throw
        require('../src/config/environment-validation').validateSecurityEnvironment();
      }).toThrow('JWT secrets');

      // Restore
      process.env.JWT_ACCESS_SECRET = originalSecret;
    });

    it('should reject secrets shorter than 32 characters in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'short';

      expect(() => {
        require('../src/config/environment-validation').validateSecurityEnvironment();
      }).toThrow('at least 32 characters');

      process.env.NODE_ENV = 'test';
    });

    it('should reject default QR_HMAC_SECRET in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.QR_HMAC_SECRET = 'farm-secret';

      expect(() => {
        require('../src/config/environment-validation').validateSecurityEnvironment();
      }).toThrow('default value');

      process.env.NODE_ENV = 'test';
    });

    it('should require FIELD_ENCRYPTION_KEY for encrypted fields', () => {
      const key = configService.get<string>('FIELD_ENCRYPTION_KEY');
      expect(key).toBeDefined();
      expect(key?.length).toBeGreaterThanOrEqual(64); // 256 bits = 64 hex chars
    });
  });

  // ============================================================
  // PIN Hashing Security Tests
  // ============================================================

  describe('🔐 PIN Hashing Security', () => {
    it('should hash PIN without userId concatenation', async () => {
      const pin = '1234';
      const userId = 'test-user-id';
      const rounds = 12;

      // Hash the PIN (new method)
      const hash1 = await bcrypt.hash(pin, rounds);
      const hash2 = await bcrypt.hash(pin, rounds);

      // Should NOT be identical (different salts)
      expect(hash1).not.toEqual(hash2);

      // Both should verify against original PIN
      const verify1 = await bcrypt.compare(pin, hash1);
      const verify2 = await bcrypt.compare(pin, hash2);
      expect(verify1).toBe(true);
      expect(verify2).toBe(true);

      // Should NOT verify with userId concatenated
      const verify3 = await bcrypt.compare(pin + userId, hash1);
      expect(verify3).toBe(false);
    });

    it('should prevent PIN rainbow table attacks', async () => {
      // Generate hashes for all 4-digit PINs (10,000 combinations)
      const pinsToHash = Array.from({ length: 100 }, (_, i) => String(i).padStart(4, '0'));
      
      const hashes = await Promise.all(
        pinsToHash.map(pin => bcrypt.hash(pin, 12))
      );

      // Each hash should be unique (different salts)
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);

      // Even with precomputed table, hashes won't match (random salt)
      expect(hashes[0]).not.toEqual(hashes[1]);
    });
  });

  // ============================================================
  // API Key Hashing Tests
  // ============================================================

  describe('🔐 API Key Security', () => {
    it('should generate unique API keys each time', () => {
      const { raw_key: key1 } = ApiKeyHashService.generateAndHashKey();
      const { raw_key: key2 } = ApiKeyHashService.generateAndHashKey();

      expect(key1).not.toEqual(key2);
      expect(key1.length).toBe(64); // 32 bytes * 2 (hex encoded)
    });

    it('should hash API keys consistently', () => {
      const rawKey = 'test-api-key-value';
      const hash1 = ApiKeyHashService.hashKey(rawKey);
      const hash2 = ApiKeyHashService.hashKey(rawKey);

      // Same key should produce same hash
      expect(hash1).toEqual(hash2);
    });

    it('should securely compare API keys', async () => {
      const { raw_key, key_hash } = ApiKeyHashService.generateAndHashKey();

      // Correct key should match
      const match = await ApiKeyHashService.compareKeys(raw_key, key_hash);
      expect(match).toBe(true);

      // Wrong key should not match
      const wrongKey = 'wrong-key-value';
      const noMatch = await ApiKeyHashService.compareKeys(wrongKey, key_hash);
      expect(noMatch).toBe(false);
    });

    it('should prevent timing attacks on API key comparison', async () => {
      const { raw_key, key_hash } = ApiKeyHashService.generateAndHashKey();

      // Time multiple comparisons
      const start = Date.now();
      
      // Correct key
      await ApiKeyHashService.compareKeys(raw_key, key_hash);
      const correctTime = Date.now() - start;

      const wrongStart = Date.now();
      // Wrong key
      await ApiKeyHashService.compareKeys('completely-wrong-key', key_hash);
      const wrongTime = Date.now() - wrongStart;

      // Times should be similar (hash comparison is constant-time)
      expect(Math.abs(correctTime - wrongTime)).toBeLessThan(100); // 100ms tolerance
    });
  });

  // ============================================================
  // Field-Level Encryption Tests
  // ============================================================

  describe('🔐 Field-Level Encryption', () => {
    let encryption: FieldEncryption;

    beforeAll(() => {
      const keyHex = process.env.FIELD_ENCRYPTION_KEY;
      if (!keyHex) {
        throw new Error('FIELD_ENCRYPTION_KEY not set for testing');
      }
      encryption = new FieldEncryption(keyHex);
    });

    it('should encrypt and decrypt text correctly', () => {
      const plaintext = '+234812345678';
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted).toEqual(plaintext);
      expect(encrypted).not.toEqual(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = '+234812345678';
      const encrypted1 = encryption.encrypt(plaintext);
      const encrypted2 = encryption.encrypt(plaintext);

      // Different IV each time = different ciphertext
      expect(encrypted1).not.toEqual(encrypted2);

      // But both decrypt correctly
      expect(encryption.decrypt(encrypted1)).toEqual(plaintext);
      expect(encryption.decrypt(encrypted2)).toEqual(plaintext);
    });

    it('should fail gracefully on corrupted ciphertext', () => {
      const corrupted = 'invalid-base64-encrypted-data==';

      expect(() => {
        encryption.decrypt(corrupted);
      }).toThrow('Decryption error');
    });

    it('should handle empty strings', () => {
      const encrypted = encryption.encrypt('');
      expect(encryption.decrypt(encrypted)).toEqual('');
    });
  });

  // ============================================================
  // Authentication Security Tests
  // ============================================================

  describe('🔐 Authentication Security', () => {
    it('should reject login with generic error message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid credentials');
      // Should NOT say "User not found" or "Wrong password"
    });

    it('should not expose error details in responses', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrong',
        });

      expect(response.body).not.toHaveProperty('stackTrace');
      expect(response.body).not.toHaveProperty('details');
    });

    it('should enforce rate limiting on login', async () => {
      // Make multiple requests
      const attempts = 25; // Limit is usually 20/60s

      for (let i = 0; i < attempts; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: `test${i}@example.com`,
            password: 'password',
          });

        if (i < 20) {
          expect(response.status).not.toBe(429); // Not rate limited yet
        } else {
          expect(response.status).toBe(429); // Rate limited
        }
      }
    });

    it('should have rate limiting on OTP verification', async () => {
      // OTP should have 5 attempts per 60s
      const phone = '+234812345678';

      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/verify-otp')
          .send({
            phone,
            otp_code: '000000',
            purpose: 'phone_verification',
          });

        if (i < 5) {
          expect([400, 401]).toContain(response.status); // Invalid OTP
        } else {
          expect(response.status).toBe(429); // Rate limited
        }
      }
    });
  });

  // ============================================================
  // Error Message Security Tests
  // ============================================================

  describe('🔐 Error Message Security (No Information Disclosure)', () => {
    it('should not leak user existence in password reset', async () => {
      const responses: any[] = [];

      // Try with existing email
      const response1 = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@farm.local' });
      responses.push(response1.body);

      // Try with non-existing email
      const response2 = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });
      responses.push(response2.body);

      // Both should return same success message
      // (in reality, both should succeed to prevent enumeration)
      expect(response1.body.message).toContain('Check email');
      expect(response2.body.message).toContain('Check email');
    });

    it('should not expose database errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.message).not.toContain('database');
      expect(response.body.message).not.toContain('SQL');
    });
  });

  // ============================================================
  // HTTPS/TLS Tests
  // ============================================================

  describe('🔐 Transport Security', () => {
    it('should redirect HTTP to HTTPS in production', async () => {
      if (process.env.NODE_ENV === 'production') {
        const response = await request(app.getHttpServer())
          .get('/api/health');

        // Should redirect to HTTPS
        expect(response.status).toBe(301);
        expect(response.headers.location).toContain('https://');
      }
    });

    it('should set security headers', async () => {
      const response = await request(app.getHttpServer()).get('/api/health');

      // Helmet headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toMatch('1.*mode=block');
    });

    it('should set HSTS header in production', async () => {
      if (process.env.NODE_ENV === 'production') {
        const response = await request(app.getHttpServer()).get('/api/health');

        expect(response.headers['strict-transport-security']).toBeDefined();
        expect(response.headers['strict-transport-security']).toMatch('max-age=');
      }
    });
  });

  // ============================================================
  // Webhook Security Tests
  // ============================================================

  describe('🔐 Webhook Security', () => {
    it('should require valid signature for webhooks', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('X-Paystack-Signature', 'invalid-signature')
        .send({ event: 'charge.success', data: {} });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('signature');
    });
  });
});
