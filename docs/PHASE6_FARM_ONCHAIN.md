# Phase 6 – FARM on Algorand, user wallet addresses, USDC deposits

All features are OFF until configured. `GET /api/v1/wallet/chain/status` lists only the NAMES of missing variables.

## Env vars
| Variable | Needed for | Notes |
|---|---|---|
| `CHAIN_WALLETS_ENABLED=true` | addresses | master switch |
| `ALGORAND_NETWORK=testnet` | all | `mainnet` refused unless `ALGORAND_ALLOW_MAINNET=true` |
| `ALGORAND_NODE_URL`, `ALGORAND_TOKEN` (optional) | all | https algod |
| `ALGORAND_INDEXER_URL`, `ALGORAND_INDEXER_TOKEN` (optional) | deposits | https indexer |
| `ALGORAND_ISSUER_MNEMONIC` | all | FARM issuer/reserve + pays new accounts' min balance (secret) |
| `WALLET_KEY_ENCRYPTION_KEY` | addresses | 32 random bytes, base64 (`openssl rand -base64 32`). Losing it = losing custodial keys. Secret. |
| `FARM_ASA_ID` | addresses, mirror | FARM ASA (2 decimals, 1 FARM = 1 KSh) |
| `USDC_ASA_ID` | addresses, deposits | Circle USDC ASA id for the chosen network |
| `CHAIN_WALLET_FUND_MICROALGOS` | optional | default 310000 (0.31 ALGO per new account) |
| `CHAIN_DEPOSITS_ENABLED=true` | deposits | indexer polling every 60 s |
| `USDC_KES_RATE_URL`, `USDC_KES_RATE_JSON_PATH` | conversion | https JSON source + dotted path to the KSh-per-USDC number |
| `USDC_KES_RATE_MIN/MAX`, `USDC_KES_RATE_MAX_AGE_SECONDS` | optional | sanity bounds (50/500) and cache (300 s) |
| `FARM_ONCHAIN_MIRROR_ENABLED=true` | mirror execute | allows reconciliation to send FARM from the reserve |

## Flow
1. User opens Profile → wallet address: a custodial account is created (secret key AES-256-GCM encrypted, bound to the address), funded with min balance and opted in to USDC + FARM. Shown as "setting up" until ready.
2. USDC sent to the address is detected by the indexer poller and recorded once (unique network+tx+asset). It is converted to FARM at the live rate from the configured source and credited to the internal wallet with ledger + blockchain records. No rate => stays `pending_rate`, nothing invented.
3. Reconciliation (`POST /admin/chain/reconcile?mode=dry|execute`): compares internal FARM balance with on-chain FARM per ready wallet. `execute` only tops up shortfalls from the reserve. The internal ledger remains the source of truth; nothing is debited and no production balance is changed.
