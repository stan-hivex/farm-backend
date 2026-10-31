-- Didit KYB (business verification) result storage. Additive only.
-- The Didit result is advisory: businesses.status is still set only by a
-- manual admin review.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "didit_kyb_session_id" VARCHAR(128);
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "didit_kyb_status" VARCHAR(64);
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "didit_kyb_entity_status" VARCHAR(32);
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "didit_kyb_result" JSONB;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "didit_kyb_updated_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "idx_businesses_didit_kyb_session" ON "businesses"("didit_kyb_session_id");
