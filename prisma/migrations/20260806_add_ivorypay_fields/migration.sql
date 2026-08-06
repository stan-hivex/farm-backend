-- Migration: add ivorypay provider fields to Deposit

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "providerTransactionId" text;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "providerReference" text;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "checkoutId" text;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "paymentReference" text;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "merchantReference" text;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "providerPayload" jsonb;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "verifiedAt" timestamp(6);

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "creditedAt" timestamp(6);

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "webhookReceived" timestamp(6);

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "verificationAttempts" integer DEFAULT 0;

-- Optional: create indexes on common lookup fields
CREATE INDEX IF NOT EXISTS idx_deposit_provider_transaction_id ON "Deposit" ("providerTransactionId");
CREATE INDEX IF NOT EXISTS idx_deposit_provider_ref ON "Deposit" ("providerReference");
