#!/usr/bin/env bash
set -euo pipefail
API_KEY_ENV=${1:-IVORYPAY_API_KEY}
API_KEY=${!API_KEY_ENV:-}

if [ -z "$API_KEY" ]; then
  echo "Environment variable $API_KEY_ENV is not set. Set it and re-run: export $API_KEY_ENV=sk_live_xxx"
  exit 2
fi

TOKENS=(USDT USDC)
for t in "${TOKENS[@]}"; do
  echo "\n=== $t networks (raw) ==="
  curl -s -H "Authorization: $API_KEY" "https://api.ivorypay.io/api/v1/crypto-transfer/$t/networks" | jq . || curl -s -H "Authorization: $API_KEY" "https://api.ivorypay.io/api/v1/crypto-transfer/$t/networks"

  echo "\n=== $t network identifiers (one per line) ==="
  curl -s -H "Authorization: $API_KEY" "https://api.ivorypay.io/api/v1/crypto-transfer/$t/networks" | jq -r '(.data // .) | (if type=="array" then .[] else . end) | (.network // .id // .code // .name)' || echo "(jq missing)"

done

echo "\nDone. Do NOT paste your API key anywhere. Paste only the JSON outputs if you want me to parse them."