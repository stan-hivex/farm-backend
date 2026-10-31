# Phase 5 – Project tokenization on Algorand (TestNet)

Disabled by default. `GET /api/v1/tokenization/status` reports `enabled` and the *names* of missing variables (never values).

| Variable | Required | Notes |
|---|---|---|
| `TOKENIZATION_ENABLED` | yes | must be `true` |
| `ALGORAND_NETWORK` | yes | must be `testnet` (mainnet refused) |
| `ALGORAND_NODE_URL` | yes | https algod URL, e.g. a TestNet node |
| `ALGORAND_TOKEN` | if your node needs it | algod API token |
| `ALGORAND_ISSUER_MNEMONIC` | yes | 25-word mnemonic of a funded TestNet account (secret; set in Render env only) |

Flow: business requests (funded/closed project) → admin approves → one ASA is created (decimals 0, 1 unit = 1 FARM invested) → allocations recorded per investment in FARM custody. Only confirmed algod results (asset id, tx id, round) are stored. Failures store the error and can be retried.
