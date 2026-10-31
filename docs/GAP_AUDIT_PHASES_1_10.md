# Gap audit: Phases 1–10 vs the master prompt (backend)

Fixes are on `v2-phase10`, the top of the stack. Fixing them on the earlier branches would need rebases and force-pushes, which are not allowed. Everything is additive.

| Requirement | Before | Fix |
|---|---|---|
| Mkulima spending categories (Hotels, Flights, Transport, Shopping, Bills, Services, Investments, Crypto) | missing | `ai_spend_permissions.spend_categories` (migration `20261111090000_v2_mkulima_categories`, all on by default). `PUT /v1/ai/permissions` accepts `spend_categories`. Enforced server-side: `book_flight`→Flights, `pay_intent`→Services. P2P `send_farm` is a transfer and has no category. |
| Confirmation above limit | done (every AI payment needs PIN; above caps is refused) | none |
| Automatic approval rules | missing | **Not built.** Paying without a PIN would remove the PIN guarantee on AI payments. Needs owner decision. |
| Mkulima Activity fields & statuses | partial (audit log only) | `GET /v1/ai/activity`: request, agent action, category, provider, amount, payment method, status (Pending / Awaiting Approval / Processing / Completed / Failed / Cancelled / Refunded), timestamp, booking ref, confirmation, refund status |
| Security: devices, login history, sessions | backend done (`/auth/sessions`, revoke one/others/all) | app paths fixed + UI (app PR) |
| Centralized notifications | travel / agent payments did not notify | in-app notifications: agent payment awaiting approval; flight booked / under review / refunded |
| Admin payment / escrow monitoring | escrow done; agent payments + x402 missing | `GET /v1/admin/payments-monitor` (read-only, admin roles) |
| Admin user review, KYB, project, tokenization, listing, disputes | backend done | app pages for project/listing review and tokenization (app PR) |
| Admin risk | `security-events`/fraud only partial | not built further (no risk model is specified in the note) |
