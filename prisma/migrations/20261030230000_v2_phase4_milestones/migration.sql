-- AlterTable
ALTER TABLE "investment_projects" ADD COLUMN     "released_amount" DECIMAL(30,8) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(30,8) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
    "evidence" TEXT,
    "evidence_url" TEXT,
    "requested_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "released_amount" DECIMAL(30,8),
    "released_at" TIMESTAMPTZ(6),
    "released_by" UUID,
    "release_notes" TEXT,
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_project_id_position_key" ON "project_milestones"("project_id", "position");

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

