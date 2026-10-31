-- Additive: per-transaction marker so on-chain sync picks up rows that
-- complete after they were created (deposits, withdrawals, travel holds...).
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "chain_enqueued_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "idx_transactions_chain_pending"
  ON "transactions" ("created_at")
  WHERE "status" = 'completed' AND "chain_enqueued_at" IS NULL;
