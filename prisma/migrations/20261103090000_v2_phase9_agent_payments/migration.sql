-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "created_by" UUID,
    "live_mode" BOOLEAN NOT NULL DEFAULT true,
    "amount" DECIMAL(30,8) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'FARM',
    "description" VARCHAR(255),
    "reference" VARCHAR(100),
    "metadata" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'requires_payment',
    "payer_user_id" UUID,
    "transaction_reference" VARCHAR(255),
    "amount_refunded" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(255),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "created_by" UUID,
    "live_mode" BOOLEAN NOT NULL DEFAULT true,
    "amount" DECIMAL(30,8) NOT NULL,
    "reason" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'succeeded',
    "transaction_id" UUID,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_authorizations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "label" VARCHAR(100),
    "per_tx_cap" DECIMAL(30,8) NOT NULL,
    "daily_cap" DECIMAL(30,8) NOT NULL,
    "monthly_cap" DECIMAL(30,8) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_payment_requests" (
    "id" UUID NOT NULL,
    "authorization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "failure_reason" VARCHAR(255),
    "transaction_reference" VARCHAR(255),
    "idempotency_key" VARCHAR(255),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_intents_business_id_created_at_idx" ON "payment_intents"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_payer_user_id_created_at_idx" ON "payment_intents"("payer_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_business_id_idempotency_key_key" ON "payment_intents"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_refunds_intent_id_idx" ON "payment_refunds"("intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_business_id_idempotency_key_key" ON "payment_refunds"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "agent_authorizations_user_id_status_idx" ON "agent_authorizations"("user_id", "status");

-- CreateIndex
CREATE INDEX "agent_authorizations_business_id_status_idx" ON "agent_authorizations"("business_id", "status");

-- CreateIndex
CREATE INDEX "agent_payment_requests_user_id_status_idx" ON "agent_payment_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "agent_payment_requests_authorization_id_created_at_idx" ON "agent_payment_requests"("authorization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_payment_requests_business_id_idempotency_key_key" ON "agent_payment_requests"("business_id", "idempotency_key");

