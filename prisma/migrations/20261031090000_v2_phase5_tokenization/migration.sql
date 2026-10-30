-- CreateTable
CREATE TABLE "project_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'requested',
    "network" VARCHAR(20) NOT NULL DEFAULT 'testnet',
    "asset_name" VARCHAR(32) NOT NULL,
    "unit_name" VARCHAR(8) NOT NULL,
    "unit_price" DECIMAL(30,8) NOT NULL,
    "total_units" BIGINT NOT NULL,
    "asset_id" BIGINT,
    "create_tx_id" VARCHAR(64),
    "confirmed_round" BIGINT,
    "issuer_address" VARCHAR(64),
    "requested_by" UUID,
    "reviewed_by" UUID,
    "notes" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_token_id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "units" BIGINT NOT NULL,
    "custody" VARCHAR(30) NOT NULL DEFAULT 'farm_custody',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_tokens_project_id_key" ON "project_tokens"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_tokens_asset_id_key" ON "project_tokens"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_tokens_create_tx_id_key" ON "project_tokens"("create_tx_id");

-- CreateIndex
CREATE INDEX "project_tokens_status_idx" ON "project_tokens"("status");

-- CreateIndex
CREATE UNIQUE INDEX "token_allocations_investment_id_key" ON "token_allocations"("investment_id");

-- CreateIndex
CREATE INDEX "token_allocations_user_id_idx" ON "token_allocations"("user_id");

-- AddForeignKey
ALTER TABLE "project_tokens" ADD CONSTRAINT "project_tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "token_allocations" ADD CONSTRAINT "token_allocations_project_token_id_fkey" FOREIGN KEY ("project_token_id") REFERENCES "project_tokens"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

