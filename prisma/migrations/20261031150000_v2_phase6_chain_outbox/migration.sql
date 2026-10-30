-- CreateTable
CREATE TABLE "chain_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "leg" VARCHAR(10) NOT NULL DEFAULT 'main',
    "network" VARCHAR(20) NOT NULL,
    "from_user_id" UUID,
    "to_user_id" UUID,
    "from_address" VARCHAR(64) NOT NULL,
    "to_address" VARCHAR(64) NOT NULL,
    "amount_units" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "tx_id" VARCHAR(64),
    "last_valid" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chain_outbox_tx_id_key" ON "chain_outbox"("tx_id");

-- CreateIndex
CREATE INDEX "chain_outbox_status_next_attempt_at_idx" ON "chain_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "chain_outbox_transaction_id_leg_key" ON "chain_outbox"("transaction_id", "leg");

