# V2 changelog
- Phase 5–6: tokenization, FARM on-chain (Algorand) with chain outbox.
- Phase 7: Mkulima AI assistant (xAI), actions confirmed with PIN, caps.
- Phase 8 + 10: travel — LiteAPI hotels, Duffel flights (provider abstraction).
- Phase 9: agent payments — mandates, PIN, per-tx/daily/monthly caps, intents, refunds.
- Phase 10: x402 paid API endpoints.
- Business: onboarding, Didit KYB, invoices, payment links, payouts, public API keys (sandbox/live), customers, investment projects.
- Auth: change password, email verification (Resend), hashed OTPs. Kenya default country.
- IvoryPay retired behind `IVORYPAY_RETIRED`.
- E2E fixes: Prisma exception filter (bad ids → 400/404 not 500); user-specific GETs no longer cached; prose fields no longer rejected by safe-input pipe; failed payouts keep amount/method; Paystack no longer mock-verifies without explicit local flag (prevented crediting unpaid deposits).
