BEGIN;

-- 1) Add provider_network column to Withdrawal (nullable)
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS provider_network VARCHAR;

-- 2) Backfill common BSC display name variants to canonical provider code
UPDATE "Withdrawal"
SET network = 'BSC_MAINNET', provider_network = 'BSC_MAINNET'
WHERE UPPER(COALESCE(network, '')) IN (
  'BNB SMART CHAIN (BEP20)',
  'BNB SMART CHAIN',
  'BEP20'
);

-- 3) Update transactions.metadata.network JSON where it contains display names
UPDATE transactions
SET metadata = jsonb_set(metadata::jsonb, '{network}', '"BSC_MAINNET"', true)
WHERE metadata->>'network' IN (
  'BNB SMART CHAIN (BEP20)',
  'BNB SMART CHAIN',
  'BEP20'
);

-- 4) Backfill the specific failed reference to provider code and mark pending for reprocessing
UPDATE "Withdrawal"
SET network = 'BSC_MAINNET', provider_network = 'BSC_MAINNET', status = 'PENDING'
WHERE reference = '89a3cebe-c1e7-4c52-9881-80b4e6617f11';

UPDATE transactions
SET metadata = jsonb_set(metadata::jsonb, '{network}', '"BSC_MAINNET"', true), status = 'pending', processed_at = NULL
WHERE transaction_reference = '89a3cebe-c1e7-4c52-9881-80b4e6617f11';

COMMIT;
