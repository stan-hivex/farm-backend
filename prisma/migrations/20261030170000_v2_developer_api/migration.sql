-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "business_id" UUID,
ADD COLUMN     "key_prefix" VARCHAR(40),
ADD COLUMN     "mode" VARCHAR(10),
ADD COLUMN     "name" VARCHAR(120),
ADD COLUMN     "revoked_at" TIMESTAMP(6),
ADD COLUMN     "rotated_from_id" TEXT,
ADD COLUMN     "status" VARCHAR(20) DEFAULT 'active';

-- CreateTable
CREATE TABLE "business_webhook_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "url" TEXT NOT NULL,
    "description" VARCHAR(255),
    "events" JSONB NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endpoint_id" UUID NOT NULL,
    "event_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "next_attempt_at" TIMESTAMP(6),
    "delivered_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_api_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "api_key_id" TEXT,
    "mode" VARCHAR(10) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "ip_address" VARCHAR(100),
    "error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_api_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_sandbox_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "object_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(20,2),
    "currency" VARCHAR(10),
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_sandbox_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_webhook_endpoints_business_id_mode_idx" ON "business_webhook_endpoints"("business_id", "mode");

-- CreateIndex
CREATE INDEX "business_webhook_deliveries_endpoint_id_created_at_idx" ON "business_webhook_deliveries"("endpoint_id", "created_at");

-- CreateIndex
CREATE INDEX "business_webhook_deliveries_status_next_attempt_at_idx" ON "business_webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "business_api_requests_business_id_created_at_idx" ON "business_api_requests"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "business_api_requests_api_key_id_created_at_idx" ON "business_api_requests"("api_key_id", "created_at");

-- CreateIndex
CREATE INDEX "business_sandbox_objects_business_id_object_type_created_at_idx" ON "business_sandbox_objects"("business_id", "object_type", "created_at");

-- CreateIndex
CREATE INDEX "api_keys_business_id_mode_idx" ON "api_keys"("business_id", "mode");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_webhook_endpoints" ADD CONSTRAINT "business_webhook_endpoints_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_webhook_deliveries" ADD CONSTRAINT "business_webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "business_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_api_requests" ADD CONSTRAINT "business_api_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_api_requests" ADD CONSTRAINT "business_api_requests_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_sandbox_objects" ADD CONSTRAINT "business_sandbox_objects_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

