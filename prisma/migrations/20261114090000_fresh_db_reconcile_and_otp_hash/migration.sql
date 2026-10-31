-- Additive, idempotent reconcile so a fresh DB built from migrations matches
-- schema.prisma for everything the app uses. No-op on DBs that already have it.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'APPLE_PAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'transfer_request';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'request_expired';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'admin';

ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "theme" VARCHAR(20) NOT NULL DEFAULT 'system';
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "api_key_hash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_api_key_hash_key" ON "api_keys"("api_key_hash");

CREATE TABLE IF NOT EXISTS "biometric_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "device_fingerprint" VARCHAR(512),
    "device_id" VARCHAR(255),
    "biometric_type" VARCHAR(50),
    "trusted_device" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(6),
    "verification_count" INTEGER DEFAULT 0,
    "failed_attempts" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "biometric_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "biometric_settings_user_id_key" ON "biometric_settings"("user_id");
CREATE INDEX IF NOT EXISTS "idx_biometric_user" ON "biometric_settings"("user_id");
CREATE INDEX IF NOT EXISTS "idx_biometric_trusted" ON "biometric_settings"("trusted_device");
DO $$ BEGIN
  ALTER TABLE "biometric_settings" ADD CONSTRAINT "biometric_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One-time codes are now stored as SHA-256 hashes (64 hex chars). Widening
-- VARCHAR(10) -> TEXT keeps every existing value; matches schema.prisma.
ALTER TABLE "otp_verifications" ALTER COLUMN "otp_code" SET DATA TYPE TEXT;
