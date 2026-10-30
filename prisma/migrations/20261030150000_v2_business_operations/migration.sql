-- CreateEnum
CREATE TYPE "business_member_role" AS ENUM ('owner', 'admin', 'finance', 'accountant', 'operations', 'developer');

-- CreateEnum
CREATE TYPE "business_invoice_status" AS ENUM ('draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "business_escrow_status" AS ENUM ('created', 'awaiting_payment', 'funded', 'in_progress', 'release_requested', 'released', 'disputed', 'expired');

-- CreateTable
CREATE TABLE "business_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "business_member_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "customer_id" UUID,
    "invoice_number" VARCHAR(64) NOT NULL,
    "status" "business_invoice_status" NOT NULL DEFAULT 'draft',
    "currency" VARCHAR(20) NOT NULL DEFAULT 'FARM',
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(30,8) NOT NULL,
    "total" DECIMAL(30,8) NOT NULL,
    "notes" TEXT,
    "due_date" DATE,
    "sent_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "transaction_reference" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_payment_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(30,8) NOT NULL,
    "currency" VARCHAR(20) NOT NULL DEFAULT 'FARM',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "source_id" UUID NOT NULL,
    "payer_user_id" UUID,
    "amount" DECIMAL(30,8) NOT NULL,
    "transaction_reference" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_escrows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "escrow_contract_id" UUID,
    "buyer_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(30,8) NOT NULL,
    "milestones" JSONB,
    "status" "business_escrow_status" NOT NULL DEFAULT 'created',
    "expires_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "release_requested_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_business_members_user" ON "business_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_business_members_business_user" ON "business_members"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_business_customers_business" ON "business_customers"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_invoices_invoice_number_key" ON "business_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_business_invoices_business_status" ON "business_invoices"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "business_payment_links_code_key" ON "business_payment_links"("code");

-- CreateIndex
CREATE INDEX "idx_business_payment_links_business" ON "business_payment_links"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_payments_transaction_reference_key" ON "business_payments"("transaction_reference");

-- CreateIndex
CREATE INDEX "idx_business_payments_business_created" ON "business_payments"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_business_payments_source" ON "business_payments"("source", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_escrows_escrow_contract_id_key" ON "business_escrows"("escrow_contract_id");

-- CreateIndex
CREATE INDEX "idx_business_escrows_business_status" ON "business_escrows"("business_id", "status");

-- CreateIndex
CREATE INDEX "idx_business_escrows_buyer" ON "business_escrows"("buyer_user_id");

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business_customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_payment_links" ADD CONSTRAINT "business_payment_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_escrows" ADD CONSTRAINT "business_escrows_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_escrows" ADD CONSTRAINT "business_escrows_escrow_contract_id_fkey" FOREIGN KEY ("escrow_contract_id") REFERENCES "escrow_contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

