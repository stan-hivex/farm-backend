Param(
  [string]$ApiKeyEnvName = "IVORYPAY_API_KEY"
)

$apiKey = (Get-Item -Path Env:\$ApiKeyEnvName -ErrorAction SilentlyContinue).Value
if (-not $apiKey) {
  Write-Error "Environment variable $ApiKeyEnvName is not set. Set it and re-run the script."
  exit 2
}

$tokens = @('USDT','USDC')

foreach ($t in $tokens) {
  Write-Output "\n=== $t networks (raw) ==="
  # Print raw JSON (try jq pretty-print if available)
  $cmd = "curl.exe -s -H \"Authorization: $apiKey\" \"https://api.ivorypay.io/api/v1/crypto-transfer/$t/networks\""
  try {
    iex "$cmd | jq ."
  } catch {
    iex "$cmd"
    Write-Output "(Install 'jq' for pretty JSON parsing or pipe to 'python -m json.tool')"
  }

  Write-Output "\n=== $t network identifiers (one per line) ==="
  try {
    iex "$cmd | jq -r '(.data // .) | (if type==\"array\" then .[] else . end) | (.network // .id // .code // .name)'
  } catch {
    Write-Output "Unable to extract identifiers (requires 'jq')."
    Write-Output "You can still view raw JSON above and copy the 'network' or 'name' fields."
  }
}

Write-Output "\nDone. Do NOT paste your API key anywhere. Paste only the JSON outputs if you want me to parse them."