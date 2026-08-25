CREATE TABLE "pending_login_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "role" "user_role" NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pending_login_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_login_verifications_user_id_status_idx"
ON "pending_login_verifications"("user_id", "status");

CREATE INDEX "pending_login_verifications_expires_at_idx"
ON "pending_login_verifications"("expires_at");

ALTER TABLE "pending_login_verifications"
ADD CONSTRAINT "pending_login_verifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;