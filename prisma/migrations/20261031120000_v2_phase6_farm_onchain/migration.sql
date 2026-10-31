-- AlterTable
ALTER TABLE "project_tokens" ADD COLUMN     "farm_asset_id" BIGINT;

-- CreateTable
CREATE TABLE "user_chain_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "network" VARCHAR(20) NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "enc_secret" TEXT NOT NULL,
    "enc_iv" VARCHAR(32) NOT NULL,
    "enc_tag" VARCHAR(32) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "funded_tx_id" VARCHAR(64),
    "usdc_opt_in_tx" VARCHAR(64),
    "farm_opt_in_tx" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'created',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_chain_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network" VARCHAR(20) NOT NULL,
    "tx_id" VARCHAR(64) NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "asset_symbol" VARCHAR(10) NOT NULL,
    "user_id" UUID NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "sender" VARCHAR(64),
    "amount_units" BIGINT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "confirmed_round" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'detected',
    "rate_kes" DECIMAL(20,8),
    "rate_source" VARCHAR(255),
    "rate_at" TIMESTAMPTZ(6),
    "farm_amount" DECIMAL(30,8),
    "transaction_id" UUID,
    "credited_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_sync_state" (
    "key" VARCHAR(100) NOT NULL,
    "last_round" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_sync_state_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "farm_reconciliation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network" VARCHAR(20) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "ledger_total" DECIMAL(30,8) NOT NULL,
    "chain_total" DECIMAL(30,8),
    "wallets" INTEGER NOT NULL DEFAULT 0,
    "started_by" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "farm_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_mirror_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "ledger_bal" DECIMAL(30,8) NOT NULL,
    "chain_bal" DECIMAL(30,8) NOT NULL,
    "delta_units" BIGINT NOT NULL,
    "tx_id" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_mirror_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_chain_wallets_user_id_key" ON "user_chain_wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_chain_wallets_address_key" ON "user_chain_wallets"("address");

-- CreateIndex
CREATE INDEX "chain_deposits_user_id_idx" ON "chain_deposits"("user_id");

-- CreateIndex
CREATE INDEX "chain_deposits_status_idx" ON "chain_deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chain_deposits_network_tx_id_asset_id_key" ON "chain_deposits"("network", "tx_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "farm_mirror_entries_run_id_user_id_key" ON "farm_mirror_entries"("run_id", "user_id");

-- AddForeignKey
ALTER TABLE "farm_mirror_entries" ADD CONSTRAINT "farm_mirror_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "farm_reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

