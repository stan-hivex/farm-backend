# Chain deposits (Receive on Algorand)

Every user with a ready custodial wallet has one Algorand address. Customers can send:

| Asset | How it is credited |
|---|---|
| FARM (ASA `FARM_ASA_ID`) | 1:1, immediately after confirmation, marked `chain_settled` |
| USDC (ASA `USDC_ASA_ID`) | FARM = USDC × live USDC→KSh rate (`USDC_KES_RATE_*`) − spread |
| ALGO (native, asset id 0, 6 decimals) | FARM = ALGO × live ALGO→KSh rate (`ALGO_KES_RATE_*`) − spread |

Anything on another network or any other token is **not** detected and may be lost; the app says so on the address screen.

## Flow
1. `pollDeposits` (every 60 s when `CHAIN_DEPOSITS_ENABLED=true`) scans ASA transfers from the indexer and, for ALGO, the
   `pay` transactions received by each ready custodial address since the cursor `"<network>:algo:0"` in `chain_sync_state`.
   The first run starts at the current round (no backfill).
2. Ignored: the wallet's own `funded_tx_id` (the ~0.31 ALGO provisioning payment), any payment from the funder, from the
   FARM reserve, from another custodial address, self-payments and zero amounts.
3. Rows go into `chain_deposits` with `skipDuplicates` on `(network, tx_id, asset_id)` — idempotent by txid.
4. `creditPending` groups USDC and ALGO, fetches each live rate once, applies `USDC_KES_SPREAD_BPS` (in FARM's favour)
   and credits inside one DB transaction (claimed via status update, so a deposit is credited once). With no valid rate the
   rows move to `pending_rate` and are retried later.
5. `GET /v1/wallet/chain/deposits` returns history including `asset`, rate, source and FARM amount.

## Not done / risks
- There is **no ALGO sweep**: credited ALGO stays on the custodial address (it also covers fees/min-balance). Any future sweep must
  keep the address minimum balance (0.1 ALGO + 0.1 per opted-in asset) plus fees.
- ALGO detection polls the indexer once per address per cycle; with many wallets this needs batching or a block-follower.
- Rates come from one configurable URL (+ optional fallback); bounds `ALGO_KES_RATE_MIN/MAX` reject outliers.
