-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "transaction_type" ADD VALUE 'investment_refund';
ALTER TYPE "transaction_type" ADD VALUE 'investment_settlement';

-- AlterTable
ALTER TABLE "investment_projects" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "business_id" UUID,
ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "currency" VARCHAR(10) NOT NULL DEFAULT 'FARM',
ADD COLUMN     "instrument_type" VARCHAR(30),
ADD COLUMN     "listed_at" TIMESTAMPTZ(6),
ADD COLUMN     "location" VARCHAR(255),
ADD COLUMN     "maximum_investment" DECIMAL(30,8),
ADD COLUMN     "review_notes" TEXT,
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "risk_factors" TEXT,
ADD COLUMN     "sector" VARCHAR(40),
ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "summary" VARCHAR(500),
ADD COLUMN     "team" TEXT,
ADD COLUMN     "use_of_funds" TEXT;

-- AlterTable
ALTER TABLE "user_investments" ADD COLUMN     "disclosure_acceptance_id" UUID;

-- CreateTable
CREATE TABLE "project_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'investors',
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "notes" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "author_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_profiles" (
    "user_id" UUID NOT NULL,
    "eligibility_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "category" VARCHAR(30),
    "notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "risk_disclosure_acceptances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "ip" VARCHAR(64),
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_disclosure_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_documents_project_id_idx" ON "project_documents"("project_id");

-- CreateIndex
CREATE INDEX "project_reviews_project_id_created_at_idx" ON "project_reviews"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "project_updates_project_id_created_at_idx" ON "project_updates"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_disclosure_acceptances_user_id_project_id_idx" ON "risk_disclosure_acceptances"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "investment_projects_business_id_idx" ON "investment_projects"("business_id");

-- CreateIndex
CREATE INDEX "investment_projects_status_sector_idx" ON "investment_projects"("status", "sector");

-- AddForeignKey
ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

