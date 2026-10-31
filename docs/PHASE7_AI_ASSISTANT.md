# Phase 7 — Mkulima AI assistant

Off by default. It turns on only when `AI_ASSISTANT_ENABLED=true` and `AI_API_KEY` is set. The chosen provider is **xAI**: `AI_BASE_URL` defaults to `https://api.x.ai/v1` and `AI_MODEL` to `grok-4.3` (function calling; $1.25 in / $2.50 out per 1M tokens, https://docs.x.ai/docs/models). For the most capable model set `AI_MODEL=grok-4.7` ($2 / $6). When it is off, `POST /v1/ai/chat` returns 503 and `GET /v1/ai/status` returns `enabled:false`.

## Provider
The assistant works with any OpenAI-compatible `/chat/completions` endpoint that supports tool calling, such as OpenAI, xAI, Groq, OpenRouter, Together, or a self-hosted vLLM or Ollama server.

| Var | Example | Notes |
|---|---|---|
| AI_ASSISTANT_ENABLED | false | master switch |
| AI_BASE_URL | https://api.x.ai/v1 (default) | no trailing `/chat/completions` |
| AI_MODEL | grok-4.3 (default) | must support tool calling |
| AI_API_KEY | (secret, xAI key from console.x.ai) | set in Render; never commit |
| AI_DAILY_MESSAGE_LIMIT | 50 | user messages per user per day |
| AI_TIMEOUT_MS | 30000 | |

## What it can read
It has read-only tools for the user's wallet, transactions, investments, business invoices (only for businesses where the user is an active member), project holdings, and AI spend settings. Every query is scoped to the JWT user, so the model cannot pick a different user.

## What it can do (limited spending)
- AI payments are **off** until the user enables them and sets a per-transaction cap, a daily cap, and the allowed actions. The only allowed action today is `send_farm`. The daily cap can be at most 100,000 FARM.
- The `propose_payment` tool only creates a **pending** request. The request expires after 10 minutes.
- The user confirms the request in the app with their **PIN** (`POST /v1/ai/actions/:id/confirm`). Caps and the allowlist are checked again at that point. Execution goes through `WalletsService.sendFunds`, so the normal PIN check, limits, fees and ledger logic all apply. Biometric bypass is never used.
- Pending requests count toward the daily cap.
- Revoking (`POST /v1/ai/permissions/revoke`) disables AI payments immediately and cancels pending requests.
- The assistant cannot approve businesses or projects, change limits, or move money on its own.
- Every tool call, proposal, confirmation, failure, rejection, permission change and revoke is written to `ai_audit_log` (`GET /v1/ai/audit`).

## Endpoints (`/v1/ai`, JWT)
`GET status`, `POST chat`, `GET/GET :id/DELETE :id conversations`, `GET/PUT permissions`, `POST permissions/revoke`, `GET actions?status=`, `POST actions/:id/confirm` (pin), `POST actions/:id/reject`, `GET audit`.

## Migration
`20261101090000_v2_phase7_ai_assistant` is additive. It adds five new tables and nothing else.
