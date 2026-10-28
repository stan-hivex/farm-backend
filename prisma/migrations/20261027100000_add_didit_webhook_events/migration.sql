CREATE TABLE "didit_webhook_events" (
    "event_id" VARCHAR(128) NOT NULL,
    "webhook_type" TEXT,
    "session_id" TEXT,
    "status" TEXT,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "didit_webhook_events_pkey" PRIMARY KEY ("event_id")
);
