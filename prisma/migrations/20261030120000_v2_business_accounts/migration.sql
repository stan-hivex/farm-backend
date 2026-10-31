-- CreateEnum
CREATE TYPE "business_status" AS ENUM ('draft', 'under_review', 'more_information_required', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "business_person_role" AS ENUM ('director', 'beneficial_owner');

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "merchant_id" UUID,
    "legal_name" VARCHAR(255),
    "trading_name" VARCHAR(255),
    "registration_number" VARCHAR(255),
    "registration_country" VARCHAR(100),
    "incorporation_date" DATE,
    "business_type" VARCHAR(100),
    "sector" VARCHAR(100),
    "tax_id" VARCHAR(100),
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "address" TEXT,
    "postal_code" VARCHAR(30),
    "business_email" VARCHAR(255),
    "business_phone" VARCHAR(30),
    "website" VARCHAR(255),
    "description" TEXT,
    "status" "business_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "role" "business_person_role" NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "nationality" VARCHAR(100),
    "date_of_birth" DATE,
    "id_number" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "ownership_percent" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "doc_type" VARCHAR(64) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "status" "business_status" NOT NULL DEFAULT 'under_review',
    "snapshot" JSONB,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "decision_notes" TEXT,

    CONSTRAINT "business_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_owner_user_id_key" ON "businesses"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_merchant_id_key" ON "businesses"("merchant_id");

-- CreateIndex
CREATE INDEX "idx_businesses_status" ON "businesses"("status");

-- CreateIndex
CREATE INDEX "idx_business_persons_business" ON "business_persons"("business_id");

-- CreateIndex
CREATE INDEX "idx_business_documents_business" ON "business_documents"("business_id");

-- CreateIndex
CREATE INDEX "idx_business_verifications_business" ON "business_verifications"("business_id", "submitted_at" DESC);

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_persons" ADD CONSTRAINT "business_persons_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_verifications" ADD CONSTRAINT "business_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_verifications" ADD CONSTRAINT "business_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

