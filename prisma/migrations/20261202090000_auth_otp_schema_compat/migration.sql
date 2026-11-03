-- Keep existing databases compatible with the current login and OTP code.
-- These additions are idempotent so environments with the newer migrations
-- already applied can safely deploy this reconciliation.
ALTER TABLE "user_sessions"
  ADD COLUMN IF NOT EXISTS "trusted_device_id" UUID;

CREATE INDEX IF NOT EXISTS "user_sessions_trusted_device_id_idx"
  ON "user_sessions"("trusted_device_id");

ALTER TABLE "pending_login_verifications"
  ADD COLUMN IF NOT EXISTS "trusted_device_id" UUID;

ALTER TABLE "otp_verifications"
  ALTER COLUMN "otp_code" TYPE TEXT;
