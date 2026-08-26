-- Targeted indexes for high-frequency user-scoped history and reconciliation queries.
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "is_read");

CREATE INDEX IF NOT EXISTS "idx_transactions_receiver_created" ON "transactions" ("receiver_wallet_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_transactions_sender_created" ON "transactions" ("sender_wallet_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_deposits_user_status_created" ON "Deposit" ("userId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_deposits_status_updated" ON "Deposit" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_deposits_provider_ref" ON "Deposit" ("providerRef");

CREATE INDEX IF NOT EXISTS "idx_withdrawals_user_status_created" ON "Withdrawal" ("userId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_withdrawals_status_updated" ON "Withdrawal" ("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "idx_transfer_requests_sender_status_expiry" ON "transfer_requests" ("sender_user_id", "status", "expires_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_transfer_requests_requester_created" ON "transfer_requests" ("requester_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_payment_requests_recipient_status_expiry" ON "payment_requests" ("recipient_user_id", "status", "expires_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_payment_requests_requester_created" ON "payment_requests" ("requester_user_id", "created_at" DESC);