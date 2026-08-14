-- CreateTable
CREATE TABLE IF NOT EXISTS "currency_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usd_kes_rate" DECIMAL(30,8) NOT NULL,
    "farm_kes_rate" DECIMAL(30,8) NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_currency_rates_active"
    ON "currency_rates" ("is_active");

-- AddForeignKey
ALTER TABLE "currency_rates"
    ADD CONSTRAINT "currency_rates_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
