# Phase 10: x402 (HTTP 402 Payment Required) on Algorand

Off by default (`X402_ENABLED=false`). Master prompt §26 flow: **402 requirement → authorized payment → verification → service**. x402 is opt-in per business resource. It is not forced on any other transaction, and nothing is ever recorded without a real on-chain tx id.

## What it does
- **Paid API gateway** `/v1/x402/r/:id`
  - A business registers an HTTPS upstream with a price in FARM or USDC.
  - Calls without `PAYMENT-SIGNATURE` get `402` and a `PAYMENT-REQUIRED` header (x402 v2, `exact` scheme, CAIP-2 Algorand network).
  - A signed atomic group is verified (amount, receiver, asset, network/genesis, group id, no close/rekey/clawback, validity rounds, replay) and simulated.
  - The upstream is called with HMAC headers `x-farm-x402-{ts,id,tx,payer,signature}`, signed over `${ts}.${id}.${tx}.${payer}` with the resource signing secret.
  - Only after a 2xx/3xx answer is the group broadcast. The result is returned with `PAYMENT-RESPONSE`.
  - Upstream errors mean **no charge**.
- **Business management** `/v1/business/x402/resources` (CRUD, pause) and `/v1/business/x402/payments`.
  - The signing secret is shown once (`x402sec_…`) and stored sealed.
  - payTo is the owner's custodial wallet, which must be opted into the asset.
- **Facilitator** `/v1/farm/x402/{supported,verify,settle}` for API keys with the `x402:facilitate` scope.
  - Live keys only. payTo is restricted to the business's own FARM account.
- **Status** `/v1/x402/status`, `/v1/x402/supported`.
- **Records:** table `x402_payments` (unique per network+tx_id). Statuses are `settling|settled|pending|failed`; a timed-out broadcast stays `pending`. Webhook: `x402.payment.settled`.
- **Fee sponsorship** (optional, `X402_FEE_PAYER_ENABLED`): the funder signs only a 0-ALGO self-payment with fee ≤ `X402_MAX_FEE_MICROALGOS`.

## Env
| Var | Default |
|---|---|
| X402_ENABLED | false |
| X402_FEE_PAYER_ENABLED | false |
| X402_MAX_FEE_MICROALGOS | 20000 |
| X402_MAX_PRICE_FARM | 10000 |
| X402_MAX_PRICE_USDC | 100 |
| X402_MAX_TIMEOUT_SECONDS | 120 |

Also uses ALGORAND_NETWORK, ALGORAND_NODE_URL, WALLET_KEY_ENCRYPTION_KEY, FARM_ASA_ID / USDC_ASA_ID, and ALGORAND_FUNDER_MNEMONIC (fee payer only). Mainnet still needs ALGORAND_ALLOW_MAINNET=true.

## Decisions / limits
- Ledger credit for received funds comes from the existing deposit poller (CHAIN_DEPOSITS_ENABLED). Settle does not credit the ledger directly, to avoid double credit.
- Paying *external* x402 APIs from user custodial wallets is **not built**. It conflicts with the receive-only outbox policy and needs an owner decision.
- Authorization flow risk: a payer can empty their account between simulate and broadcast, so they get one free response. Upstream-first was chosen per spec default.
- The SSRF guard checks DNS before the fetch, so DNS rebinding remains a residual risk. No redirects; 2 MB / 15 s caps.
- Migration `20261110090000_v2_phase10_x402` is additive only (2 new tables).
