-- Additive: project consolidation fund fee (taken once at round close) + ledger category.
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS category VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_ledger_category ON ledger_entries(category);
ALTER TABLE investment_projects ADD COLUMN IF NOT EXISTS consolidation_fee DECIMAL(30,8) NOT NULL DEFAULT 0;
ALTER TABLE investment_projects ADD COLUMN IF NOT EXISTS consolidation_fee_at TIMESTAMPTZ(6);
UPDATE fee_configurations SET label = 'Project consolidation fund',
  description = 'Taken once when a funding round closes, as a percent of the total raised. Not refunded if the project is later cancelled.',
  payer = 'project'
 WHERE transaction_type = 'project_listing';
-- Per-project reserve: consolidation_fee taken in, consolidation_refunded paid back to investors.
ALTER TABLE investment_projects ADD COLUMN IF NOT EXISTS consolidation_refunded DECIMAL(30,8) NOT NULL DEFAULT 0;
UPDATE fee_configurations SET description = 'Taken once when a funding round closes, as a percent of the total raised, and held per project as a reserve. Refunded pro-rata to investors if the project is cancelled or makes a loss.'
 WHERE transaction_type = 'project_listing';
-- Successful completion: remaining reserve reclassified to FARM revenue (stays in the platform wallet).
ALTER TABLE investment_projects ADD COLUMN IF NOT EXISTS consolidation_released DECIMAL(30,8) NOT NULL DEFAULT 0;
UPDATE fee_configurations SET description = 'Taken once when a funding round closes (percent of total raised) and held per project as a reserve. Refunded pro-rata to investors if the project is cancelled or makes a loss; released to FARM revenue if it completes successfully.'
 WHERE transaction_type = 'project_listing';
