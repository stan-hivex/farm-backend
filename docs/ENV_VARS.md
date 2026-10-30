# Environment variables

Generated from a scan of `process.env` / ConfigService usage in `src/`. **Never commit values.** `Required` = enforced at boot in production by `environment-validation.ts`; everything else is optional, and V2 features stay off unless their flag/keys are set.

| Variable | Module(s) | Required | Default | Notes |
|---|---|---|---|---|
| `AGENT_MAX_MONTHLY_FARM` | agent-payments | optional | 200_000 |  |
| `AGENT_MAX_PER_TX_FARM` | agent-payments | optional | 50_000 |  |
| `AGENT_REQUEST_TTL_MIN` | agent-payments | optional | 30 |  |
| `AI_API_KEY` | ai-assistant | optional | — (secret) | secret — store in Render env only |
| `AI_ASSISTANT_ENABLED` | ai-assistant | optional | — |  |
| `AI_VOICE_ENABLED` | ai-assistant | optional | true (when the assistant is on) | Set to `false` to turn off `POST /api/v1/ai/voice` (xAI STT) |
| `AI_BASE_URL` | ai-assistant | optional | AI_DEFAULT_BASE_URL |  |
| `AI_DAILY_MESSAGE_LIMIT` | ai-assistant | optional | 50 |  |
| `AI_MODEL` | ai-assistant | optional | AI_DEFAULT_MODEL |  |
| `AI_TIMEOUT_MS` | ai-assistant | optional | 30000 |  |
| `ALGO_KES_RATE_URL` | chain-wallet | optional | — | https URL returning the ALGO→KES price; required (with JSON_PATH) to credit ALGO deposits |
| `ALGO_KES_RATE_JSON_PATH` | chain-wallet | optional | — | dot path to the KES price, e.g. `algorand.kes` |
| `ALGO_KES_RATE_HEADER` | chain-wallet | optional | — | optional API-key header name |
| `ALGO_KES_RATE_API_KEY` | chain-wallet | optional | — | optional — secret, Render env only |
| `ALGO_KES_RATE_FALLBACK_URL` | chain-wallet | optional | — | optional second source |
| `ALGO_KES_RATE_FALLBACK_JSON_PATH` | chain-wallet | optional | — | path for the fallback |
| `ALGO_KES_RATE_MIN` | chain-wallet | optional | — | sanity floor, default 1 |
| `ALGO_KES_RATE_MAX` | chain-wallet | optional | — | sanity ceiling, default 500 |
| `ALGO_KES_RATE_MAX_AGE_SECONDS` | chain-wallet | optional | — | cache age |
| `ALGORAND_FUNDER_MNEMONIC` | chain-wallet, x402 | optional | — (secret) | secret — store in Render env only |
| `ALGORAND_INDEXER_TOKEN` | chain-wallet | optional | — (secret) | secret — store in Render env only |
| `ALGORAND_INDEXER_URL` | blockchain, chain-wallet | optional | '', |  |
| `ALGORAND_ISSUER_MNEMONIC` | tokenization | optional | — (secret) | secret — store in Render env only |
| `ALGORAND_NODE_URL` | blockchain, chain-wallet, tokenization, x402 | optional | 'ALGORAND_INDEXER_URL'] |  |
| `ALGORAND_TOKEN` | blockchain, chain-wallet, tokenization, x402 | optional | — (secret) | secret — store in Render env only |
| `APP_URL` | auth, business-ops, main.ts | optional | — |  |
| `AWS_DEFAULT_REGION` | common | optional | — |  |
| `AWS_REGION` | common | optional | process.env.AWS_DEFAULT_REGION |  |
| `AWS_SECRETS_MANAGER_SECRET_ID` | common | optional | — (secret) | secret — store in Render env only |
| `BCRYPT_ROUNDS` | auth, common | optional | — |  |
| `BUSINESS_PAY_BASE_URL` | business-ops | optional | — |  |
| `CACHE_ENABLED` | common | optional | 'true', |  |
| `CACHE_PREFIX` | common | optional | 'cache:' |  |
| `CACHE_TTL_SECONDS` | admin, common | optional | '60' |  |
| `CHAIN_WALLETS_ENABLED` | chain-wallet | optional | — |  |
| `CHAIN_WALLET_FUND_MICROALGOS` | chain-wallet | optional | '310000' |  |
| `CLOUDINARY_API_KEY` | uploads | optional | — (secret) | secret — store in Render env only |
| `CLOUDINARY_API_SECRET` | uploads | optional | — (secret) | secret — store in Render env only |
| `CLOUDINARY_CLOUD_NAME` | uploads | optional | — |  |
| `CLOUD_KEY` | uploads | optional | — (secret) | secret — store in Render env only |
| `CLOUD_NAME` | uploads | optional | — |  |
| `CLOUD_SECRET` | uploads | optional | — (secret) | secret — store in Render env only |
| `CORS_ORIGINS` | main.ts, websocket | optional | '' |  |
| `DATABASE_URL` | config, database, main.ts | **prod** | — |  |
| `DIDIT_API_KEY` | didit | optional | — (secret) | secret — store in Render env only |
| `DIDIT_KYB_WORKFLOW_ID` | didit | optional | — |  |
| `DIDIT_WEBHOOK_SECRET` | didit | optional | — (secret) | secret — store in Render env only |
| `DUFFEL_API_TOKEN` | travel | optional | — (secret) | secret — store in Render env only |
| `DUFFEL_BASE_URL` | travel | optional | 'https://api.duffel.com' |  |
| `EMAIL_VERIFICATION_URL` | auth | optional | — |  |
| `ENABLE_CLUSTER` | main.ts | optional | — |  |
| `FARM_ASA_ID` | blockchain, chain-wallet, tokenization, x402 | optional | 'USDC_ASA_ID'] |  |
| `FARM_RESERVE_ADDRESS` | chain-wallet | optional | — |  |
| `FARM_RESERVE_MNEMONIC` | chain-wallet | optional | — (secret) | secret — store in Render env only |
| `FIELD_ENCRYPTION_KEY` | common, config | **prod** | — (secret) | secret — store in Render env only |
| `FIREBASE_CLIENT_EMAIL` | notifications | optional | — |  |
| `FIREBASE_PASSWORD_RESET_CONTINUE_URL` | auth | optional | — (secret) | secret — store in Render env only |
| `FIREBASE_PRIVATE_KEY` | notifications | optional | — (secret) | secret — store in Render env only |
| `FIREBASE_PROJECT_ID` | notifications | optional | — |  |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | notifications | optional | — |  |
| `FIREBASE_STORAGE_BUCKET` | receipts | optional | — |  |
| `FLIGHT_PROVIDER` | travel | optional | pkfare |  |
| `FRAUD_MAX_WEBHOOK_AMOUNT` | webhook | optional | 5000000 |  |
| `FRONTEND_URL` | main.ts | optional | — |  |
| `HOTEL_PROVIDER` | travel | optional | — |  |
| `IDEMPOTENCY_KEY_TTL_MS` | common | optional | — (secret) | secret — store in Render env only |
| `IVORYPAY_API_KEY` | common, ivorypay | optional | — (secret) | secret — store in Render env only |
| `IVORYPAY_BASE_URL` | ivorypay | optional | 'https://api.ivorypay.io/api', |  |
| `IVORYPAY_CRYPTO_PAYOUTS_ENABLED` | ivorypay | optional | — |  |
| `IVORYPAY_FARM_TO_USD_RATE` | webhook | optional | '130' |  |
| `IVORYPAY_RETIRED` | common | optional | — |  |
| `IVORYPAY_WEBHOOK_SECRET` | webhook | optional | — (secret) | secret — store in Render env only |
| `JWT_ACCESS_EXPIRES` | auth | optional | '15m' |  |
| `JWT_ACCESS_SECRET` | auth, config, websocket | **prod** | — (secret) | secret — store in Render env only |
| `JWT_REFRESH_SECRET` | auth, config | **prod** | — (secret) | secret — store in Render env only |
| `LITEAPI_API_KEY` | travel | optional | — (secret) | secret — store in Render env only |
| `LITEAPI_BASE_URL` | travel | optional | 'https://api.liteapi.travel/v3.0' |  |
| `LITEAPI_BOOK_BASE_URL` | travel | optional | 'https://book.liteapi.travel/v3.0' |  |
| `NODE_ENV` | app.module.ts, auth, common, config, database, health, main.ts, websocket | optional | 'development' |  |
| `NOWPAYMENTS_2FA_SECRET` | nowpayments | optional | — (secret) | secret — store in Render env only |
| `NOWPAYMENTS_API_KEY` | nowpayments | optional | — (secret) | secret — store in Render env only |
| `NOWPAYMENTS_EMAIL` | nowpayments | optional | — |  |
| `NOWPAYMENTS_IPN_CALLBACK_URL` | nowpayments | optional | — |  |
| `NOWPAYMENTS_IPN_SECRET` | common | optional | — (secret) | secret — store in Render env only |
| `NOWPAYMENTS_PASSWORD` | nowpayments | optional | — (secret) | secret — store in Render env only |
| `NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL` | nowpayments | optional | — |  |
| `OTP_HASH_SECRET` | auth | optional | — (secret) | secret — store in Render env only |
| `PAYMENT_INTENT_TTL_MIN` | agent-payments | optional | 60 |  |
| `PAYSTACK_BANK_CODE_MAP` | paystack | optional | }; |  |
| `PAYSTACK_SECRET_KEY` | paystack | optional | — (secret) | secret — store in Render env only |
| `PAYSTACK_WEBHOOK_SECRET` | common, webhook | optional | — (secret) | secret — store in Render env only |
| `PKFARE_BASE_URL` | travel | optional | PKFARE_SANDBOX_URL |  |
| `PKFARE_PARTNER_ID` | travel | optional | !this.env.PKFARE_PARTNER_KEY |  |
| `PKFARE_PARTNER_KEY` | travel | optional | — (secret) | secret — store in Render env only |
| `PKFARE_SANDBOX_URL` | travel | optional | — |  |
| `PORT` | main.ts, notifications, support | optional | configService.get<number>('PORT' |  |
| `QR_HMAC_SECRET` | admin, auth, config, qr | **prod** | — (secret) | secret — store in Render env only |
| `RATE_LIMIT` | app.module.ts | optional | — |  |
| `RATE_LIMIT_TTL` | app.module.ts | optional | — |  |
| `REDIS_URL` | app.module.ts, common, config | **prod** | — |  |
| `REFRESH_TOKEN_TTL_DAYS` | auth | optional | — (secret) | secret — store in Render env only |
| `REQUIRE_PHONE_VERIFICATION` | auth | optional | — |  |
| `RESEND_API_KEY` | auth, notifications | optional | — (secret) | secret — store in Render env only |
| `RESEND_FROM` | auth, notifications | optional | this.cfg.get<string>('SMTP_FROM' |  |
| `SMTP_FROM` | notifications | optional | — |  |
| `SMTP_HOST` | notifications | optional | — |  |
| `SMTP_PASS` | notifications | optional | — |  |
| `SMTP_PORT` | notifications | optional | — |  |
| `SMTP_USER` | notifications | optional | pass: cfg.get('SMTP_PASS' |  |
| `STK_PUSH_BASE_URL` | stk | optional | 'https://sandbox.safaricom.co.ke', |  |
| `STK_PUSH_CALLBACK_URL` | stk | optional | 'https://app.farm/webhooks/stk-push', |  |
| `STK_PUSH_CONSUMER_KEY` | stk | optional | — (secret) | secret — store in Render env only |
| `STK_PUSH_CONSUMER_SECRET` | stk | optional | — (secret) | secret — store in Render env only |
| `STK_PUSH_ENABLED` | stk | optional | 'false' |  |
| `STK_PUSH_PASSKEY` | stk | optional | — (secret) | secret — store in Render env only |
| `STK_PUSH_SHORTCODE` | stk | optional | '' |  |
| `STK_PUSH_TRANSACTION_TYPE` | stk | optional | 'CustomerPayBillOnline', |  |
| `STUCK_DEPOSIT_LOOKBACK_HOURS` | webhook | optional | — |  |
| `TRAVEL_FLIGHT_PROVIDER` | travel | optional | pkfare |  |
| `TURNSTILE_SECRET_KEY` | common, config | **prod** | — (secret) | secret — store in Render env only |
| `TWILIO_ACCOUNT_SID` | notifications | optional | — |  |
| `TWILIO_AUTH_TOKEN` | notifications | optional | — (secret) | secret — store in Render env only |
| `TWILIO_FROM` | notifications | optional | — |  |
| `TWILIO_SENDER` | notifications | optional | — |  |
| `USDC_ASA_ID` | chain-wallet, x402 | optional | null |  |
| `USDC_KES_RATE_URL` | chain-wallet | optional | — |  |
| `WEBHOOK_DEDUP_PREFIX` | webhook | optional | 'webhook:processed:' |  |
| `WEBHOOK_DEDUP_TTL_MS` | webhook | optional | 0 |  |
| `WEBHOOK_LOCK_TTL_MS` | webhook | optional | 60000 |  |
| `WEB_CONCURRENCY` | main.ts | optional | cpus( |  |
| `X402_MAX_FEE_MICROALGOS` | x402 | optional | 20000 |  |
| `X402_MAX_PRICE_FARM` | x402 | optional | 10000 |  |
| `X402_MAX_PRICE_USDC` | x402 | optional | 100 |  |
| `X402_MAX_TIMEOUT_SECONDS` | x402 | optional | 120 |  |

## Feature flags (all default off)
- `TRAVEL_FLIGHT_PROVIDER` / `FLIGHT_PROVIDER`: `pkfare` (default) or `duffel` (optional legacy adapter). No TBO adapter exists yet.
- `AI_ASSISTANT_ENABLED` + `AI_API_KEY` (xAI; `AI_BASE_URL` default `https://api.x.ai/v1`, `AI_MODEL` default `grok-4.3`)
- `AGENT_PAYMENTS_ENABLED`, `X402_ENABLED`, `TRAVEL_ENABLED`, `HOTELS_ENABLED`
- `IVORYPAY_RETIRED=true` disables IvoryPay paths
- `PAYSTACK_MOCK_VERIFY=true` — local only; ignored when `NODE_ENV=production` or `RENDER=true`
