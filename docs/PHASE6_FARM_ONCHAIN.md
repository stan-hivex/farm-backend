# Phase 6 – FARM on Algorand (custodial, receive-only)

1 FARM = 1 KSh. Every user gets a custodial Algorand address (Profile → Settings → Wallet address).
The address is **receive-only**: users can deposit USDC or FARM to it, but there is no endpoint to send
on-chain to an external address, and the sync worker only pays FARM-controlled accounts (the reserve
and custodial addresses).

Everything is **off** until its env vars are set. TestNet is the default; MainNet is refused unless
`ALGORAND_ALLOW_MAINNET=true`.

## Live MainNet values

- `FARM_ASA_ID=3759208862` (FARM, unit FARM, 2 decimals, 10,000,000,000,000.00 supply (10 trillion; replaced the earlier 1bn asset 3759199569, destroyed)): https://allo.info/asset/3759208862
- `FARM_RESERVE_ADDRESS=A4P7SNWVO47VRYUVOHCWZ5OIF6A2XTPSGHMXGWBXN5XCDHJ4E4N5TXDTCI` (Falcon-1024 quantum account, manager + reserve, holds the full supply)
- Creation tx: https://allo.info/tx/AVKTWQY7QQ4JTAOXXIRGILSQGICDDUD67IXAG774WA6USWG6XCCA
- MainNet also needs `ALGORAND_NETWORK=mainnet`, `ALGORAND_ALLOW_MAINNET=true`, `USDC_ASA_ID=31566704`.

## Quantum (Falcon-1024) signing

Native Falcon-1024 accounts are live on MainNet since go-algorand v5.0.0 (Aug 2026). The backend signs with
`algosdk` 3.9 + `@algorandfoundation/falcon-wasm` through one signer abstraction (`src/chain-wallet/signer.ts`):

- `ALGORAND_KEY_SCHEME` = `falcon1024` (default) or `ed25519`. Per-role overrides:
  `FARM_RESERVE_KEY_SCHEME`, `ALGORAND_FUNDER_KEY_SCHEME`, `ALGORAND_ISSUER_KEY_SCHEME`.
- Keys are still 25-word mnemonics. For Falcon the key is derived with `pq25WordMnemonicToSeed`
  (the same as algosdk/Pera quantum accounts), so the same words resolve to the same Falcon address.
  The reserve signer refuses to start if the derived address is not `FARM_RESERVE_ADDRESS`.
- New customer custodial wallets are Falcon accounts (`key_scheme='falcon1024'`). Only the 32-byte
  seed is stored, AES-256-GCM encrypted (address as AAD). Older rows (`key_scheme='ed25519'`, 64-byte key)
  keep working. Migration `20261031180000_v2_phase6_key_scheme` is additive.
- Fees: a Falcon-signed txn costs 3x the min fee (0.003 ALGO), which was confirmed with algod simulate. The funder
  pays every fee in a pooled group: funder share plus the custodial/reserve share. Custodial accounts never need
  ALGO beyond their min balance: 0.1 base + 0.1 USDC + 0.1 FARM = 0.3, and 0.31 ALGO is funded.
- Phase 5 project ASAs are signed by the issuer through the same abstraction.
- `src/blockchain/algorand.service.ts` (legacy, pre-Phase 5 helper) is unchanged and stays ed25519.

## Accounts

| Account | Who creates it | Purpose | Key on server? |
|---|---|---|---|
| **FARM reserve** (owner's Pera account) | Owner, in Pera | Creates/holds the FARM ASA, funds custodial accounts with FARM, receives fees | Only if `FARM_RESERVE_MNEMONIC` is set (needed for automatic sync/mirror) |
| **Funder** | Ops (any Algorand account) | Pays 0.31 ALGO per new wallet (0.1 min balance + 2×0.1 opt-ins + fees) and pools fees for FARM moves | Yes, `ALGORAND_FUNDER_MNEMONIC` |
| **Custodial user accounts** | Backend | One per user, keys AES-256-GCM-encrypted with `WALLET_KEY_ENCRYPTION_KEY` (address bound as AAD) | Encrypted in DB |
| **Phase 5 issuer** | Ops | Only creates the per-project ASAs (tokenization). It never creates or holds FARM. | `ALGORAND_ISSUER_MNEMONIC` (Phase 5) |

The funder can be the same account as the Phase 5 issuer if you prefer; the app never creates the FARM ASA.

## Create FARM in Pera (reference only; MainNet FARM already exists as 3759208862, created by the Falcon reserve)

1. Pera Wallet → create (or pick) an account to be the **FARM reserve**. Back up its 25-word passphrase offline.
   Use TestNet first: Settings → Developer Settings → Node Settings → TestNet; fund it from the
   TestNet dispenser (https://bank.testnet.algorand.network/).
2. Fund the account with ≥ 0.2 ALGO (0.1 min balance + 0.1 per created asset) plus fees.
3. Pera Web (https://web.perawallet.app) → connect the account → **Create Asset** (Asset Creation tool), enter:
   - Asset name: `FARM`
   - Unit name: `FARM`
   - Total supply: e.g. `10000000000000` (= 10 trillion FARM; on-chain base units = total × 100)
   - Decimals: **`2`** (1 FARM = 1 KSh, smallest unit 0.01 = 1 cent)
   - URL: optional (project site)
   - Manager / Reserve address: the reserve account itself
   - Freeze / Clawback: leave empty, or set to the reserve if you want the ability to freeze/claw back (users see this in Pera)
   - Default frozen: **No**
4. Sign. Note the **Asset ID** from the confirmation (or from https://testnet.explorer.perawallet.app).
5. Set on Render: `FARM_ASA_ID=<asset id>`, `FARM_RESERVE_ADDRESS=<reserve address>`.
6. The creator account is automatically opted in. New custodial wallets opt in to FARM and USDC on creation.
7. Repeat on MainNet only after the TestNet run is signed off.

## How the reserve funds custodial accounts

Two options:

- **A. Server-side reserve key (automatic).** Put the reserve's 25 words in Render as `FARM_RESERVE_MNEMONIC`
  (secret env var; never logged, never returned by an API). The server checks it matches `FARM_RESERVE_ADDRESS`.
  Enables `FARM_ONCHAIN_SYNC_ENABLED` (everyday payments move on chain) and `FARM_ONCHAIN_MIRROR_ENABLED`
  (reconciliation top-ups). Recommended: keep only a working float in this reserve and the bulk supply in a
  second Pera account you top it up from.
- **B. Manual top-up (no key on the server).** Leave `FARM_RESERVE_MNEMONIC` unset. Run
  `POST /v1/admin/chain/reconcile?mode=dry`; it lists each address's ledger vs chain balance and the
  shortfall. Send those amounts from Pera by hand. Sync and mirror stay off, and the DB ledger stays the source of truth.

## Flows

- **USDC deposit** → recorded (unique network+tx+asset) → converted at the live USDC→KES rate minus the spread →
  FARM credited in the ledger; the outbox then sends that FARM reserve→user on chain.
- **FARM deposit from outside** (e.g. from a Pera wallet) → credited **1:1** (rate 1, source `peg`). It is
  already on chain, so it is marked `chain_settled` and never moved again. FARM moved by the reserve or between
  custodial accounts is ignored (not a deposit).
- **Everyday payments** (`FARM_ONCHAIN_SYNC_ENABLED=true`): every 30 s the worker reads completed ledger
  transactions after a go-live cursor into `chain_outbox` (unique per transaction+leg: `main` = net amount
  sender→receiver, `fee` = fee sender→reserve). Users without a ready address map to the reserve. Sending:
  - the row is claimed atomically;
  - txId + lastValid are saved **before** sending;
  - a retry first checks whether that txId confirmed, and only rebuilds once lastValid has passed (no double-send);
  - not enough FARM on chain → `blocked`, retried with backoff (run reconciliation);
  - errors → `failed`, with exponential backoff up to 1 h.
  The funder pays fees through an atomic fee-pooled group.
- **Reconciliation**: `POST /v1/admin/chain/reconcile?mode=dry|execute`. Execute (mirror flag + reserve key)
  tops up addresses whose chain balance is below the ledger. It is refused while outbox rows are in flight.
  `chain_above_ledger` rows are reported only.

Admin: `GET /v1/admin/chain/status`, `GET /v1/admin/chain/outbox`, `POST /v1/admin/chain/outbox/process`,
`POST /v1/admin/chain/outbox/retry`, `POST /v1/admin/chain/deposits/sync`.

## USDC→KES rate (no hard-coded rate)

Verified 30 Oct 2026:

| Source | URL | JSON path | Notes |
|---|---|---|---|
| **CoinGecko (primary)** | `https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=kes` (Pro: `https://pro-api.coingecko.com/...`) | `usd-coin.kes` | Real USDC price. Demo plan is free (10k calls/mo, header `x-cg-demo-api-key`, attribution, no commercial licence); Basic is $29/mo with a commercial licence. https://www.coingecko.com/en/api/pricing |
| **open.er-api.com (fallback)** | `https://open.er-api.com/v6/latest/USD` | `rates.KES` | USD→KES, daily, free, attribution. https://www.exchangerate-api.com/docs/free |
| fawazahmed0 (alt fallback) | `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` | `usd.kes` | Free, daily, no key |
| Yellow Card (future) | partner API | – | Needs partner account, HMAC, IP allow-list |

The fallback is USD→KES, which assumes USDC ≈ 1 USD (it is close to the Binance USDC/USDT rate of 1.0017).
Use a spread of `USDC_KES_SPREAD_BPS=100`–`150` (1–1.5%). The spread is taken off the mid rate, so the user gets
fewer FARM per USDC. Values outside `USDC_KES_RATE_MIN`/`MAX` are rejected; deposits then wait in `pending_rate`.

## Env vars

| Var | Needed for |
|---|---|
| `CHAIN_WALLETS_ENABLED=true`, `ALGORAND_NETWORK` (testnet), `ALGORAND_NODE_URL`, `ALGORAND_INDEXER_URL`, `ALGORAND_TOKEN`/`ALGORAND_INDEXER_TOKEN` (opt), `ALGORAND_ALLOW_MAINNET` (opt) | wallets |
| `WALLET_KEY_ENCRYPTION_KEY` (32 bytes base64: `openssl rand -base64 32`) | wallets |
| `ALGORAND_FUNDER_MNEMONIC` | wallets (0.31 ALGO each) + fees |
| `ALGORAND_KEY_SCHEME` (default `falcon1024`), `FARM_RESERVE_KEY_SCHEME`, `ALGORAND_FUNDER_KEY_SCHEME`, `ALGORAND_ISSUER_KEY_SCHEME` (opt) | signing scheme |
| `FARM_ASA_ID` (MainNet 3759208862), `FARM_RESERVE_ADDRESS` (MainNet A4P7…TXDTCI), `USDC_ASA_ID` (TestNet 10458941, MainNet 31566704) | wallets |
| `CHAIN_DEPOSITS_ENABLED=true` | deposit polling |
| `USDC_KES_RATE_URL`, `USDC_KES_RATE_JSON_PATH`, `USDC_KES_RATE_HEADER` + `USDC_KES_RATE_API_KEY` (opt), `USDC_KES_RATE_FALLBACK_URL`, `USDC_KES_RATE_FALLBACK_JSON_PATH`, `USDC_KES_SPREAD_BPS`, `USDC_KES_RATE_MIN`, `USDC_KES_RATE_MAX`, `USDC_KES_RATE_MAX_AGE_SECONDS` | USDC conversion |
| `FARM_RESERVE_MNEMONIC` | sync + mirror (option A) |
| `FARM_ONCHAIN_SYNC_ENABLED=true` | everyday payments on chain |
| `FARM_ONCHAIN_MIRROR_ENABLED=true` | reconciliation execute |
