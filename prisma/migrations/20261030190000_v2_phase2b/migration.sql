-- AlterTable
ALTER TABLE "escrow_contracts" ADD COLUMN     "released_amount" DECIMAL(30,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "business_invoices" ADD COLUMN     "last_emailed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "business_payments" ADD COLUMN     "channel" VARCHAR(20) NOT NULL DEFAULT 'app';

-- CreateTable
CREATE TABLE "business_web_checkouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "source_id" UUID NOT NULL,
    "transaction_reference" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "amount_kes" DECIMAL(20,2) NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "payer_email" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_web_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_web_checkouts_transaction_reference_key" ON "business_web_checkouts"("transaction_reference");

-- CreateIndex
CREATE INDEX "business_web_checkouts_status_created_at_idx" ON "business_web_checkouts"("status", "created_at");

-- CreateIndex
CREATE INDEX "business_web_checkouts_source_source_id_idx" ON "business_web_checkouts"("source", "source_id");

-- AddForeignKey
ALTER TABLE "business_web_checkouts" ADD CONSTRAINT "business_web_checkouts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

