import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '../../prisma/migrations');
const names = readdirSync(dir)
  .filter((n) => /^\d/.test(n))
  .sort();

describe('prisma migrations (fresh DB)', () => {
  it('creates transfer_requests before the performance indexes use it', () => {
    const create = names.findIndex((n) =>
      /CREATE TABLE IF NOT EXISTS "transfer_requests"/.test(
        readFileSync(join(dir, n, 'migration.sql'), 'utf8'),
      ),
    );
    const perf = names.indexOf('20260826120000_performance_indexes');
    expect(create).toBeGreaterThanOrEqual(0);
    expect(create).toBeLessThan(perf);
  });
  it('fixing migrations are additive and idempotent', () => {
    for (const n of [
      '20260826110000_bootstrap_transfer_requests',
      '20261114090000_fresh_db_reconcile_and_otp_hash',
      '20261202090000_auth_otp_schema_compat',
    ]) {
      const sql = readFileSync(join(dir, n, 'migration.sql'), 'utf8');
      expect(sql).not.toMatch(
        /\bDROP (TABLE|COLUMN|INDEX|TYPE)|TRUNCATE|DELETE FROM|RENAME/i,
      );
      expect(sql).not.toMatch(/CREATE TABLE "(?!.*IF NOT EXISTS)/);
      expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX "/);
    }
  });

  it('keeps the OTP schema compatible with login and registration', () => {
    const sql = readFileSync(
      join(dir, '20261202090000_auth_otp_schema_compat', 'migration.sql'),
      'utf8',
    );
    expect(sql).toMatch(
      /ALTER TABLE "pending_login_verifications"\s+ADD COLUMN IF NOT EXISTS "trusted_device_id" UUID/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "user_sessions"\s+ADD COLUMN IF NOT EXISTS "trusted_device_id" UUID/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "otp_verifications"\s+ALTER COLUMN "otp_code" TYPE TEXT/,
    );
  });
});
