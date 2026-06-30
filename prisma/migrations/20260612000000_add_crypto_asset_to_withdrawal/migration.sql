-- Add cryptoAsset to Withdrawal model
ALTER TABLE "Withdrawal"
ADD COLUMN "cryptoAsset" VARCHAR(20);

-- Optional: backfill cryptoAsset for existing rows where network implies asset
UPDATE "Withdrawal"
SET "cryptoAsset" = CASE
  WHEN "network" ILIKE '%USDC%' THEN 'USDC'
  WHEN "network" ILIKE '%USDT%' THEN 'USDT'
  ELSE NULL
END
WHERE "cryptoAsset" IS NULL;
