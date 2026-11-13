-- A push token may receive an account's private notifications only while it
-- is bound to that account's active session. Logout and remote revocation
-- clear the binding; possessing an FCM/APNs token is not authorization.

ALTER TABLE "device_tokens" ADD COLUMN IF NOT EXISTS "session_id" UUID;
ALTER TABLE "device_tokens" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(6);
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(6);

ALTER TABLE "device_tokens" ALTER COLUMN "token" TYPE VARCHAR(4096);

-- One row per push token. Keep the newest registration and drop the rest so
-- account switching cannot leave the previous account attached to the device.
DELETE FROM "device_tokens" AS older
USING "device_tokens" AS newer
WHERE older.token = newer.token
  AND older.id <> newer.id
  AND (
    COALESCE(older.last_seen, older.created_at, TIMESTAMP '1970-01-01')
      < COALESCE(newer.last_seen, newer.created_at, TIMESTAMP '1970-01-01')
    OR (
      COALESCE(older.last_seen, older.created_at, TIMESTAMP '1970-01-01')
        = COALESCE(newer.last_seen, newer.created_at, TIMESTAMP '1970-01-01')
      AND older.id < newer.id
    )
  );

-- Registrations from before session binding are not authorized. The signed-in
-- app registers the token again and binds it to the current session.
UPDATE "device_tokens"
SET "is_active" = false,
    "revoked_at" = COALESCE("revoked_at", NOW())
WHERE "session_id" IS NULL
  AND "is_active" IS DISTINCT FROM false;

CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_key" ON "device_tokens" ("token");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_session_id" ON "device_tokens" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_active" ON "device_tokens" ("user_id", "is_active");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_tokens_session_id_fkey'
  ) THEN
    ALTER TABLE "device_tokens"
      ADD CONSTRAINT "device_tokens_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
