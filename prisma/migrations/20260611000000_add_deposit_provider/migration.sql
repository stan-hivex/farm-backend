-- Add provider field to Deposit model
ALTER TABLE "Deposit"
ADD COLUMN "provider" VARCHAR(50);

-- Backfill existing deposits based on payment method
UPDATE "Deposit"
SET "provider" = CASE
  WHEN "paymentMethod" = 'CRYPTO' THEN 'ivorypay'
  WHEN "paymentMethod" IN ('CARD', 'MOBILE_MONEY') THEN 'paystack'
  ELSE NULL
END
WHERE "provider" IS NULL;
