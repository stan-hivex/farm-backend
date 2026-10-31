-- AlterTable
ALTER TABLE "ai_spend_permissions" ADD COLUMN     "spend_categories" TEXT[] DEFAULT ARRAY['Hotels', 'Flights', 'Transport', 'Shopping', 'Bills', 'Services', 'Investments', 'Crypto']::TEXT[];

