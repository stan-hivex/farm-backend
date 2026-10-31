-- CreateTable
CREATE TABLE "x402_resources" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "method" VARCHAR(10) NOT NULL DEFAULT 'GET',
    "upstream_url" VARCHAR(2048) NOT NULL,
    "mime_type" VARCHAR(100),
    "asset" VARCHAR(10) NOT NULL,
    "price_units" BIGINT NOT NULL,
    "pay_to" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "enc_secret" TEXT NOT NULL,
    "enc_iv" VARCHAR(32) NOT NULL,
    "enc_tag" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x402_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x402_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network" VARCHAR(64) NOT NULL,
    "tx_id" VARCHAR(64) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "business_id" UUID,
    "resource_id" UUID,
    "api_key_id" UUID,
    "payer" VARCHAR(64) NOT NULL,
    "pay_to" VARCHAR(64) NOT NULL,
    "asset" VARCHAR(10) NOT NULL,
    "asset_id" BIGINT NOT NULL,
    "amount_units" BIGINT NOT NULL,
    "fee_sponsored" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'settling',
    "error" VARCHAR(500),
    "upstream_status" INTEGER,
    "confirmed_round" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(6),

    CONSTRAINT "x402_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "x402_resources_business_id_idx" ON "x402_resources"("business_id");

-- CreateIndex
CREATE INDEX "x402_payments_business_id_created_at_idx" ON "x402_payments"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "x402_payments_resource_id_idx" ON "x402_payments"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "x402_payments_network_tx_id_key" ON "x402_payments"("network", "tx_id");

