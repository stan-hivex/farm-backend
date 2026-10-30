# Didit KYB (business verification)
Flow: business owner submits onboarding → backend creates a Didit session using workflow `DIDIT_KYB_WORKFLOW_ID` → user completes verification in Didit → Didit calls back the app (`callback` URL) and sends a signed webhook.
- Webhook: `POST /api/v1/kyb/didit/webhook`, HMAC-verified with `DIDIT_WEBHOOK_SECRET`. Events handled: session status updates (Approved → business KYB verified; Declined → rejected; In Review/Pending → pending). Unknown events are logged and ignored.
- Env: `DIDIT_API_KEY`, `DIDIT_KYB_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` (all required to enable; without them KYB session creation returns a "not configured" error and admin manual approval still works).
- Migration: `20261113090000_business_didit_kyb` (additive).
- Status: E2E-tested locally up to submission + admin approval; live Didit verification blocked by missing key.
