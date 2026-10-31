-- Fee schedule: additive columns + default rows (only inserted when missing).
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "label" VARCHAR(120);
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "payer" VARCHAR(20);
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "destination_wallet_id" UUID;
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(6);
ALTER TABLE "fee_configurations" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

INSERT INTO "fee_configurations" ("transaction_type","percentage_fee","label","description","payer","is_active")
SELECT v.k, v.p, v.l, v.d, v.payer, true FROM (VALUES
  ('escrow_creation', 1.5, 'Escrow (creation)', 'Half of the 3% escrow fee, paid by the buyer on top when the escrow is funded', 'payer'),
  ('escrow_release', 1.5, 'Escrow (release)', 'Other half of the 3% escrow fee, deducted from what the seller receives', 'receiver'),
  ('withdrawal', 1.5, 'Withdrawals', 'Deducted from the withdrawn amount', 'payer'),
  ('investment', 3, 'Investment marketplace', 'Added on top of each investment (share purchase)', 'payer'),
  ('travel_commission', 5, 'Travel (hotels and flights)', 'Shown as a separate FARM fee line on bookings', 'payer'),
  ('merchant', 1, 'Merchant transactions', 'QR sales, payment links, invoices, pay-business and API payments; deducted from what the merchant receives', 'receiver'),
  ('transfer', 0, 'P2P and cross-border transfers', 'FARM to FARM transfers', 'payer'),
  ('project_listing', 15, 'Project listing', 'Share of funds raised sent to the consolidation fund wallet', 'receiver'),
  ('received_chain', 0, 'Received on Algorand', 'Spread on ALGO/USDC received on-chain', 'receiver'),
  ('agent_payment', 0, 'Mkulima and agent payments', 'Payments made through Mkulima or agents', 'payer')
) AS v(k,p,l,d,payer)
WHERE NOT EXISTS (SELECT 1 FROM "fee_configurations" f WHERE f."transaction_type" = v.k);
