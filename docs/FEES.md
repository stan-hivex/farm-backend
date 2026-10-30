# FARM fee schedule

All rates live in the `fee_configurations` table, keyed by `transaction_type`. Admins edit them in **Admin → Fees** (`PATCH` via `AdminService.updateFee`; 0–100%, audited, cache invalidated). When no row exists, the code default applies; `FEE_<KEY>_PCT` env overrides that default. Apps read rates from `GET /api/v1/fees` and `GET /api/v1/fees/quote?type=<key>&amount=<n>` and must not hardcode them. `FeesService` caches the rates for 30 seconds.

| key | default | who pays | where |
|---|---|---|---|
| escrow_creation | 1.5% | buyer, on top | escrow funding |
| escrow_release | 1.5% | seller, deducted | full and milestone release (escrow total 3% = 1.5% + 1.5%) |
| withdrawal | 1.5% | user, deducted | all withdrawal methods |
| investment | 3% | investor, on top | each project investment (share purchase); credited to the platform wallet; not refunded on cancellation |
| travel_commission | 5% | traveller, on top | hotels and flights, shown as a separate "FARM fee" line (`service_fee_farm`; `base_price_farm` is the provider price). `TRAVEL_FX_MARKUP_BPS` now defaults to 0; the optional flat fee is `TRAVEL_SERVICE_FEE_FARM` |
| merchant | 1% | merchant, deducted | QR sales (wallet, card and crypto), payment links, invoices, pay-business and API-created links/invoices |
| transfer | 0% | — | P2P and cross-border FARM transfers, transfer and payment requests |
| project_listing | 15% | project | **mechanics pending decision** (see below); configured but not charged yet |
| received_chain | 0% | — | ALGO/USDC received on Algorand (flagged: stays 0) |
| agent_payment | 0% | — | Mkulima and agent payments (flagged: stays 0) |

There is no subscription fee.

Fee semantics: `percent × amount + flat`, floored at `minimum_fee`, capped at `maximum_fee`; 0 means no cap. Previously a 0 maximum zeroed the fee. Fees are credited to the platform (super-admin) wallet with a ledger entry.

`payments.service.ts`: the old `fee_fiat = 2%` was dead code. It was never charged or stored (the ledger recorded `fee: 0` and Paystack was charged `amount_fiat`), so it has been removed.

Project listing (15%): funds raised are held in platform custody and released per milestone to the project owner; a cancelled project refunds investors pro-rata. Where the 15% is taken (each milestone release, or once when the round closes) and how it interacts with refunds is still to be decided. Until then nothing is deducted. `destination_wallet_id` on the row (or `CONSOLIDATION_FUND_WALLET_ID`) names the consolidation fund wallet.
