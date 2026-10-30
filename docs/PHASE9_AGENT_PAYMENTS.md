# Phase 9 — Agentic payments

Everything stays off unless `AGENT_PAYMENTS_ENABLED=true`. Agents never move money on their own: every payment needs the paying user's PIN.

## Pieces
- **Payment intents** (`payment_intents`): a business asks for a FARM amount (`/v1/business/payment-intents` in the dashboard, `/v1/farm/payment-intents` with an API key). Creating one is idempotent through `Idempotency-Key`. A user pays with `POST /v1/agent-payments/intents/:id/pay` (PIN, KYC), and the money goes to the business wallet through the normal `sendFunds` path. Sandbox intents can only be simulated (`simulate-payment`), so no money moves.
- **Refunds** (`payment_refunds`): partial or full, and never more than the amount paid (optimistic lock). Dashboard refunds need `payouts:create` plus the actor's PIN. API refunds need the `refunds:write` scope. The money moves in one DB transaction: a guarded debit from the business wallet, a credit to the payer, a `transfer` transaction (`kind: payment_refund`) and 2 ledger entries.
- **Agent authorizations / mandates** (`agent_authorizations`): the user lets one approved business's agent *request* payments, within per-payment, daily and monthly limits that expire after 1–365 days. Creating one needs the PIN, and the user can revoke it at any time (this also cancels pending requests).
- **Agent payment requests** (`agent_payment_requests`): a business agent (live API key, `agent_payments:write`) asks to pay one intent under a mandate. Limits are checked when the request is created and again when it is confirmed. The user confirms with the PIN, or rejects. Requests expire after `AGENT_REQUEST_TTL_MIN`.
- **Mkulima**: a new `pay_intent` action (it must be allowed in AI settings and stays within the AI spend limits). Mkulima only proposes the action; the user confirms with the PIN.

## Webhooks
payment_intent.succeeded, refund.succeeded, agent_authorization.created/revoked, agent_payment.requested/confirmed/rejected.

## Env
| Var | Default |
|---|---|
| AGENT_PAYMENTS_ENABLED | false |
| AGENT_MAX_PER_TX_FARM | 50000 |
| AGENT_MAX_MONTHLY_FARM | 200000 |
| AGENT_REQUEST_TTL_MIN | 30 |
| PAYMENT_INTENT_TTL_MIN | 60 |

Migration `20261103090000_v2_phase9_agent_payments` is additive only (4 new tables).
