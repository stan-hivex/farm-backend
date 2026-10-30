# V2 deploy / merge runbook
1. Review & merge PR (backend #15, app #12) — by a maintainer only.
2. Back up the production DB.
3. `npx prisma migrate deploy` — applies, in order: phase6 farm_onchain → chain_outbox → key_scheme → phase7 ai_assistant → phase8 travel → phase9 agent_payments → phase10 x402 → mkulima_categories → email_verification_tokens → business_didit_kyb → fresh_db_reconcile_and_otp_hash. All additive.
4. Render env (see ENV_VARS.md): ensure the prod-required set; add `OTP_HASH_SECRET`, `IVORYPAY_RETIRED=true`; ensure `PAYSTACK_MOCK_VERIFY` is NOT set. Enable features one by one by adding their keys + flag (AI, agent payments, x402, travel/hotels, Didit, Resend).
5. Deploy, check `/api/v1/health`, smoke-test login, send, deposit.
6. Rollback: redeploy previous image; migrations are additive so schema can stay.
