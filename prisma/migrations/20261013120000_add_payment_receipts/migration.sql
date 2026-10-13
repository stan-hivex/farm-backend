CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" VARCHAR(100) NOT NULL,
    "transaction_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "fee" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "pdf_url" TEXT,
    "email_sent_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_receipts_receipt_number_key"
    ON "payment_receipts"("receipt_number");
CREATE UNIQUE INDEX "payment_receipts_transaction_id_key"
    ON "payment_receipts"("transaction_id");
CREATE INDEX "payment_receipts_merchant_id_created_at_idx"
    ON "payment_receipts"("merchant_id", "created_at" DESC);

ALTER TABLE "payment_receipts"
    ADD CONSTRAINT "payment_receipts_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts"
    ADD CONSTRAINT "payment_receipts_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
