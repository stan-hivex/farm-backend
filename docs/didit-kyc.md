# Didit KYC integration

The backend owns the Didit API key, workflow ID, session creation, webhook
verification, and KYC status updates. Add these two Didit secrets to the
backend's server-side environment only:

```dotenv
DIDIT_API_KEY=
DIDIT_WEBHOOK_SECRET=
```

Do not add either value to the Flutter `.env`, assets, or client configuration.
The workflow ID is the code constant in `src/didit/didit.service.ts`, not an
environment variable.

## Routes

- `POST /api/verify/create-session` requires the user's JWT. It derives
  `vendor_data` from the authenticated account and returns `url`, `session_id`,
  and `session_token` for the native Flutter SDK.
- `POST /api/webhooks/didit` is public and accepts Didit's
  `X-Signature-V2` webhook. Register a V3 destination for `status.updated` and
  `data.updated` at the backend's public HTTPS URL.

The webhook validates the canonical signed body and its `timestamp` (300-second
window), then inserts `event_id` and updates the user's KYC status in one
database transaction. The unique event ID makes retries safe. Apply the
`20261027100000_add_didit_webhook_events` migration before deploying.

## Flutter

The KYC screen asks the user to consent before creating a session and calls
`DiditSdk.startVerification(sessionToken)`. The SDK result is only a UI hint;
the signed webhook is authoritative. The Flutter application never receives
`DIDIT_API_KEY`.
