-- Enable UUID generation functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "escrow_status" AS ENUM ('pending', 'active', 'completed', 'disputed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('none', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "merchant_status" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('system', 'transaction', 'security', 'escrow', 'investment', 'merchant');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('deposit', 'withdrawal', 'transfer', 'merchant_payment', 'escrow_lock', 'escrow_release', 'escrow_refund', 'investment', 'roi_payout', 'fee', 'conversion', 'cross_border');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'merchant', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "wallet_type" AS ENUM ('user', 'merchant', 'treasury', 'operations', 'creator');

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "activity" VARCHAR(255),
    "metadata" JSONB,
    "ip_address" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "api_key" TEXT,
    "api_secret" TEXT,
    "permissions" JSONB,
    "last_used_at" TIMESTAMP(6),
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "action" VARCHAR(255),
    "entity_type" VARCHAR(255),
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(100),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "beneficiary_name" VARCHAR(255),
    "wallet_address" VARCHAR(255),
    "phone" VARCHAR(20),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "transaction_id" UUID,
    "blockchain_name" VARCHAR(100) DEFAULT 'algorand',
    "tx_hash" TEXT,
    "sender_address" TEXT,
    "receiver_address" TEXT,
    "asset_id" VARCHAR(255),
    "amount" DECIMAL(30,8),
    "confirmations" INTEGER DEFAULT 0,
    "network_fee" DECIMAL(30,8),
    "status" VARCHAR(50) DEFAULT 'pending',
    "raw_response" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "owner_id" UUID,
    "contact_user_id" UUID,
    "nickname" VARCHAR(255),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_border_transfers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "sender_user_id" UUID,
    "receiver_user_id" UUID,
    "sender_country" VARCHAR(100),
    "receiver_country" VARCHAR(100),
    "source_currency" VARCHAR(20),
    "destination_currency" VARCHAR(20),
    "source_amount" DECIMAL(30,8),
    "destination_amount" DECIMAL(30,8),
    "exchange_rate" DECIMAL(30,8),
    "transaction_id" UUID,
    "status" "transaction_status" DEFAULT 'pending',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_border_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_contracts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "reference_code" VARCHAR(255) NOT NULL,
    "buyer_id" UUID,
    "seller_id" UUID,
    "arbiter_id" UUID,
    "buyer_wallet_id" UUID,
    "seller_wallet_id" UUID,
    "amount" DECIMAL(30,8) NOT NULL,
    "fee" DECIMAL(30,8) DEFAULT 0,
    "status" "escrow_status" DEFAULT 'pending',
    "title" VARCHAR(255),
    "description" TEXT,
    "evidence" JSONB,
    "funded_at" TIMESTAMP(6),
    "released_at" TIMESTAMP(6),
    "disputed_at" TIMESTAMP(6),
    "resolved_at" TIMESTAMP(6),
    "auto_release_at" TIMESTAMP(6),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "escrow_id" UUID,
    "sender_id" UUID,
    "message" TEXT,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "base_currency" VARCHAR(20),
    "target_currency" VARCHAR(20),
    "rate" DECIMAL(30,8),
    "provider" VARCHAR(100),
    "fetched_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_token_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "asset_id" VARCHAR(255),
    "token_name" VARCHAR(255),
    "token_symbol" VARCHAR(50),
    "total_supply" DECIMAL(30,8),
    "decimals" INTEGER DEFAULT 6,
    "creator_wallet_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_token_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_configurations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "transaction_type" VARCHAR(100),
    "flat_fee" DECIMAL(30,8) DEFAULT 0,
    "percentage_fee" DECIMAL(10,4) DEFAULT 0,
    "minimum_fee" DECIMAL(30,8) DEFAULT 0,
    "maximum_fee" DECIMAL(30,8) DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_projects" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100),
    "description" TEXT,
    "banner_image" TEXT,
    "target_amount" DECIMAL(30,8),
    "raised_amount" DECIMAL(30,8) DEFAULT 0,
    "minimum_investment" DECIMAL(30,8),
    "roi_percent" DECIMAL(10,2),
    "duration_months" INTEGER,
    "total_backers" INTEGER DEFAULT 0,
    "status" VARCHAR(50) DEFAULT 'open',
    "starts_at" TIMESTAMP(6),
    "ends_at" TIMESTAMP(6),
    "created_by" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "document_type" VARCHAR(100),
    "front_image" TEXT,
    "back_image" TEXT,
    "selfie_image" TEXT,
    "document_number" VARCHAR(255),
    "status" "kyc_status" DEFAULT 'pending',
    "reviewed_by" UUID,
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "transaction_id" UUID,
    "wallet_id" UUID,
    "entry_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "balance_before" DECIMAL(30,8),
    "balance_after" DECIMAL(30,8),
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_payouts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID,
    "amount" DECIMAL(30,8),
    "payout_method" VARCHAR(100),
    "account_name" VARCHAR(255),
    "account_number" VARCHAR(255),
    "status" "transaction_status" DEFAULT 'pending',
    "processed_by" UUID,
    "processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "business_name" VARCHAR(255) NOT NULL,
    "business_email" VARCHAR(255),
    "business_phone" VARCHAR(20),
    "business_type" VARCHAR(100),
    "business_registration_number" VARCHAR(255),
    "business_logo" TEXT,
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "address" TEXT,
    "qr_code" TEXT,
    "qr_secret" TEXT,
    "status" "merchant_status" DEFAULT 'pending',
    "daily_limit" DECIMAL(30,8) DEFAULT 0,
    "transaction_fee_percent" DECIMAL(10,2) DEFAULT 0,
    "total_sales" DECIMAL(30,8) DEFAULT 0,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "type" "notification_type",
    "title" VARCHAR(255),
    "body" TEXT,
    "metadata" JSONB,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "otp_code" VARCHAR(10) NOT NULL,
    "purpose" VARCHAR(50),
    "attempts" INTEGER DEFAULT 0,
    "verified" BOOLEAN DEFAULT false,
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID,
    "customer_id" UUID,
    "transaction_id" UUID,
    "qr_payload" TEXT,
    "amount" DECIMAL(30,8),
    "status" "transaction_status" DEFAULT 'pending',
    "scanned_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roi_payouts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "investment_id" UUID,
    "amount" DECIMAL(30,8),
    "transaction_id" UUID,
    "payout_date" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roi_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "event_type" VARCHAR(255),
    "description" TEXT,
    "severity" VARCHAR(50),
    "ip_address" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ticket_id" UUID,
    "sender_id" UUID,
    "message" TEXT,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "subject" VARCHAR(255),
    "message" TEXT,
    "status" VARCHAR(50) DEFAULT 'open',
    "priority" VARCHAR(50) DEFAULT 'medium',
    "assigned_to" UUID,
    "closed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "setting_key" VARCHAR(255),
    "setting_value" TEXT,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "transaction_reference" VARCHAR(255) NOT NULL,
    "sender_wallet_id" UUID,
    "receiver_wallet_id" UUID,
    "transaction_type" "transaction_type" NOT NULL,
    "status" "transaction_status" DEFAULT 'pending',
    "amount" DECIMAL(30,8) NOT NULL,
    "fee" DECIMAL(30,8) DEFAULT 0,
    "net_amount" DECIMAL(30,8) DEFAULT 0,
    "currency" VARCHAR(20) DEFAULT 'FARM',
    "exchange_rate" DECIMAL(30,8),
    "description" TEXT,
    "metadata" JSONB,
    "ip_address" VARCHAR(100),
    "device_info" TEXT,
    "blockchain_tx_hash" TEXT,
    "processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_wallets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "wallet_name" VARCHAR(255),
    "wallet_address" TEXT,
    "private_key_encrypted" TEXT,
    "current_balance" DECIMAL(30,8) DEFAULT 0,
    "purpose" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "file_name" VARCHAR(255),
    "file_url" TEXT,
    "mime_type" VARCHAR(100),
    "file_size" BIGINT,
    "uploaded_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_investments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "project_id" UUID,
    "amount" DECIMAL(30,8),
    "expected_roi" DECIMAL(30,8),
    "transaction_id" UUID,
    "status" VARCHAR(50) DEFAULT 'active',
    "invested_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "maturity_date" TIMESTAMP(6),

    CONSTRAINT "user_investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "refresh_token" TEXT NOT NULL,
    "jwt_id" VARCHAR(255),
    "device_name" VARCHAR(255),
    "device_os" VARCHAR(100),
    "ip_address" VARCHAR(100),
    "user_agent" TEXT,
    "is_revoked" BOOLEAN DEFAULT false,
    "used_at" TIMESTAMP(6),
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "role" "user_role" DEFAULT 'user',
    "kyc_status" "kyc_status" DEFAULT 'none',
    "is_active" BOOLEAN DEFAULT true,
    "is_suspended" BOOLEAN DEFAULT false,
    "is_deleted" BOOLEAN DEFAULT false,
    "phone_verified" BOOLEAN DEFAULT false,
    "email_verified" BOOLEAN DEFAULT false,
    "failed_login_attempts" INTEGER DEFAULT 0,
    "failed_pin_attempts" INTEGER DEFAULT 0,
    "profile_image" TEXT,
    "bio" TEXT,
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "address" TEXT,
    "referral_code" VARCHAR(20),
    "referred_by" UUID,
    "last_login_at" TIMESTAMP(6),
    "last_seen_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "wallet_name" VARCHAR(255),
    "wallet_type" "wallet_type" DEFAULT 'user',
    "wallet_address" VARCHAR(255) NOT NULL,
    "balance" DECIMAL(30,8) DEFAULT 0,
    "locked_balance" DECIMAL(30,8) DEFAULT 0,
    "currency" VARCHAR(20) DEFAULT 'FARM',
    "blockchain_address" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "is_frozen" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider" VARCHAR(100),
    "event_name" VARCHAR(255),
    "payload" JSONB,
    "response" TEXT,
    "status" VARCHAR(50),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escrow_contracts_reference_code_key" ON "escrow_contracts"("reference_code");

-- CreateIndex
CREATE INDEX "idx_ledger_transaction" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_ledger_wallet" ON "ledger_entries"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transaction_reference_key" ON "transactions"("transaction_reference");

-- CreateIndex
CREATE INDEX "idx_transactions_receiver" ON "transactions"("receiver_wallet_id");

-- CreateIndex
CREATE INDEX "idx_transactions_sender" ON "transactions"("sender_wallet_id");

-- CreateIndex
CREATE INDEX "idx_transactions_status" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "idx_transactions_type" ON "transactions"("transaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_phone" ON "users"("phone");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_username" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_wallet_address_key" ON "wallets"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_wallets_address" ON "wallets"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_wallets_user_id" ON "wallets"("user_id");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_contracts" ADD CONSTRAINT "escrow_contracts_arbiter_id_fkey" FOREIGN KEY ("arbiter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_contracts" ADD CONSTRAINT "escrow_contracts_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_contracts" ADD CONSTRAINT "escrow_contracts_buyer_wallet_id_fkey" FOREIGN KEY ("buyer_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_contracts" ADD CONSTRAINT "escrow_contracts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_contracts" ADD CONSTRAINT "escrow_contracts_seller_wallet_id_fkey" FOREIGN KEY ("seller_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_messages" ADD CONSTRAINT "escrow_messages_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "escrow_contracts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escrow_messages" ADD CONSTRAINT "escrow_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "farm_token_config" ADD CONSTRAINT "farm_token_config_creator_wallet_id_fkey" FOREIGN KEY ("creator_wallet_id") REFERENCES "treasury_wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchant_payouts" ADD CONSTRAINT "merchant_payouts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchant_payouts" ADD CONSTRAINT "merchant_payouts_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roi_payouts" ADD CONSTRAINT "roi_payouts_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "user_investments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roi_payouts" ADD CONSTRAINT "roi_payouts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receiver_wallet_id_fkey" FOREIGN KEY ("receiver_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_wallet_id_fkey" FOREIGN KEY ("sender_wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_investments" ADD CONSTRAINT "user_investments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_investments" ADD CONSTRAINT "user_investments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_investments" ADD CONSTRAINT "user_investments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
