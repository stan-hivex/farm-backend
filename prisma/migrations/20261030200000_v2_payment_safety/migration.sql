-- AlterTable
ALTER TABLE "business_invoices" ADD COLUMN     "payment_hold_ref" VARCHAR(255),
ADD COLUMN     "payment_hold_until" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "business_web_checkouts" ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "reserved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "business_payment_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "checkout_id" UUID,
    "source" VARCHAR(20) NOT NULL,
    "source_id" UUID NOT NULL,
    "transaction_reference" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'refund_pending',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_payment_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_api_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "withdrawal_reference" VARCHAR(255),
    "response" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_api_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_payment_exceptions_transaction_reference_key" ON "business_payment_exceptions"("transaction_reference");

-- CreateIndex
CREATE INDEX "business_payment_exceptions_status_created_at_idx" ON "business_payment_exceptions"("status", "created_at");

-- CreateIndex
CREATE INDEX "business_payment_exceptions_business_id_idx" ON "business_payment_exceptions"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_api_payouts_business_id_idempotency_key_key" ON "business_api_payouts"("business_id", "idempotency_key");

