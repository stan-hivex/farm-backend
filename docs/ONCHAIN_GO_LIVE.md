# On-chain FARM: go-live checklist

Everything stays OFF until the variables below are set. The internal ledger
remains the source of truth; `ChainSyncService` copies every **completed**
transaction to Algorand through `chain_outbox` (batched every 30 s, up to 20
transfers per run, never sent twice, destinations limited to FARM custodial
accounts and the reserve).

## How flows map on chain
| Flow | On-chain leg |
|---|---|
| Send, requests, pay links, invoices, merchant QR/NFC, Mkulima agent | sender → receiver; fee: sender → reserve |
| Escrow / travel hold (`escrow_lock`) | buyer → reserve (+ fee → reserve) |
| Escrow release (`escrow_release`) | **reserve → seller** (release fee stays in the reserve) |
| Escrow / travel refund | reserve → buyer (skipped if the hold never completed, `chain_settled`) |
| Investment | investor → reserve; milestone release / refunds: reserve → business / investor |
| Consolidation fund, FARM revenue reclass | ledger only (funds already in the reserve) |
| M-Pesa/Paystack deposit | reserve → user when the deposit completes |
| Withdrawal | user → reserve when the payout completes |
| Incoming FARM | already on chain (`chain_settled`) |
| Incoming ALGO/USDC | credited FARM: reserve → user (the ALGO/USDC stays in the custodial account) |
| x402 | real Algorand payment at settle time (`X402_ENABLED`) |

Late completions: each transaction carries `chain_enqueued_at`. The worker
picks up every `completed` row with no marker, whenever it completed, and sets
the marker in the same DB transaction as the outbox rows (`transaction_id+leg`
is unique). On the first run it records a go-live boundary and marks rows that
were already completed before it; those balances are matched by reconciliation.

## Environment variables (names only)
Wallets: `CHAIN_WALLETS_ENABLED`, `ALGORAND_NETWORK` (=mainnet), `ALGORAND_ALLOW_MAINNET`,
`ALGORAND_NODE_URL`, `ALGORAND_INDEXER_URL`, `ALGORAND_TOKEN` / `ALGORAND_INDEXER_TOKEN` (optional),
`ALGORAND_FUNDER_MNEMONIC`, `WALLET_KEY_ENCRYPTION_KEY`, `USDC_ASA_ID`, `FARM_ASA_ID`,
`FARM_RESERVE_ADDRESS`, `CHAIN_WALLET_FUND_MICROALGOS` (optional),
`ALGORAND_KEY_SCHEME`, `FARM_RESERVE_KEY_SCHEME`, `ALGORAND_FUNDER_KEY_SCHEME` (optional).
Reconciliation: `FARM_ONCHAIN_MIRROR_ENABLED`, `FARM_RESERVE_MNEMONIC`.
Sync: `FARM_ONCHAIN_SYNC_ENABLED`, `FARM_RESERVE_MNEMONIC`.
Deposits/conversion (optional): `CHAIN_DEPOSITS_ENABLED`, `USDC_KES_RATE_URL`/`_JSON_PATH`,
`ALGO_KES_RATE_URL`/`_JSON_PATH`.

## Funding
- **Reserve** (`A4P7…TXDTCI`, FARM ASA 3759208862, 2 decimals): holds the FARM
  supply and must keep its ALGO min balance (0.3 ALGO). It pays no fees.
- **Funder**: pays every fee (fee pooling; Falcon signatures cost 3× min fee,
  ≈0.006 ALGO per transfer) and 0.31 ALGO + 2 opt-in fees (≈0.322 ALGO) per
  new custodial account. Budget = 0.322 × accounts to provision + 0.006 ×
  expected transfers (10 000 transfers ≈ 60 ALGO). Keep a margin and alerts.

## Steps
1. Read-only check: `node scripts/onchain-readiness.js` (public node, no keys)
   and, on the server, `GET /api/v1/admin/chain/readiness?transfers=N`
   (adds DB totals, users without addresses, outbox, funder balance).
2. Set the wallet variables with sync and mirror still off; let custodial
   accounts provision; re-run readiness until no user lacks an address and
   all are opted in.
3. Fund the funder to the budget above.
4. `POST /api/v1/admin/chain/reconcile` with `mode=dry`; review deltas; then
   set `FARM_ONCHAIN_MIRROR_ENABLED=true` + `FARM_RESERVE_MNEMONIC` and run
   `mode=execute` (reserve → users, top-ups only, never debits).
5. Set `FARM_ONCHAIN_SYNC_ENABLED=true`. Watch `GET /admin/chain/outbox`
   (blocked/failed counts) and readiness for the first hours.

## Rollback
- Unset `FARM_ONCHAIN_SYNC_ENABLED` (and the mirror flag): the worker stops at
  once; the ledger keeps working unchanged (it never depended on the chain).
- Rows left `pending/failed/blocked` in `chain_outbox` stay put and resume
  when re-enabled; `txId`+`lastValid` guards prevent a double send.
- Transactions completed while off keep `chain_enqueued_at` NULL and are
  enqueued on re-enable; to skip a window instead, mark them and reconcile.
- Nothing on chain is ever reversed automatically; differences are fixed by
  reconciliation top-ups from the reserve.
