-- AlterTable
ALTER TABLE "ai_action_requests" ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "travel_bookings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'flight',
    "provider" TEXT NOT NULL,
    "provider_offer_id" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "booking_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "offer_currency" TEXT NOT NULL,
    "offer_amount" DECIMAL(20,2) NOT NULL,
    "fx_rate" DECIMAL(20,6),
    "service_fee_farm" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_farm" DECIMAL(20,2) NOT NULL,
    "transaction_id" UUID,
    "refund_transaction_id" UUID,
    "ai_action_id" UUID,
    "summary" JSONB,
    "passengers" JSONB,
    "failure_reason" TEXT,
    "live_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_bookings_user_id_created_at_idx" ON "travel_bookings"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "travel_bookings_user_id_idempotency_key_key" ON "travel_bookings"("user_id", "idempotency_key");

