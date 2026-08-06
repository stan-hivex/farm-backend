-- Add verification payload and blockchain hash columns for Ivorypay deposits
ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "verificationPayload" jsonb;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "blockchainTransactionHash" text;
