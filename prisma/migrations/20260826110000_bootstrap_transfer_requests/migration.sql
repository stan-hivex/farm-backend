-- Bootstrap for fresh databases. transfer_requests was created outside the
-- migration history (db push), so 20260826120000_performance_indexes failed on
-- an empty DB. Idempotent and additive: a no-op where the table already exists.
DO $$ BEGIN
  CREATE TYPE "transfer_request_status" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "transfer_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_reference" VARCHAR(255) NOT NULL,
    "requester_user_id" UUID,
    "requester_wallet_id" UUID,
    "sender_user_id" UUID,
    "sender_wallet_id" UUID,
    "amount" DECIMAL(30,8) NOT NULL,
    "currency" VARCHAR(20) DEFAULT 'FARM',
    "description" TEXT,
    "status" "transfer_request_status" DEFAULT 'pending',
    "transaction_id" UUID,
    "expires_at" TIMESTAMP(6),
    "accepted_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "rejected_at" TIMESTAMP(6),
    "ip_address" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_requests_request_reference_key" ON "transfer_requests"("request_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_requests_transaction_id_key" ON "transfer_requests"("transaction_id");
CREATE INDEX IF NOT EXISTS "idx_transfer_requests_requester" ON "transfer_requests"("requester_user_id");
CREATE INDEX IF NOT EXISTS "idx_transfer_requests_sender" ON "transfer_requests"("sender_user_id");
CREATE INDEX IF NOT EXISTS "idx_transfer_requests_status" ON "transfer_requests"("status");

DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requester_wallet_id_fkey" FOREIGN KEY ("requester_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_sender_wallet_id_fkey" FOREIGN KEY ("sender_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
