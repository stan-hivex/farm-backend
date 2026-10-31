-- AlterTable
ALTER TABLE "user_chain_wallets" ADD COLUMN     "key_scheme" VARCHAR(16) NOT NULL DEFAULT 'ed25519';

