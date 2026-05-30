Param(
  [Parameter(Mandatory=$false)] [string] $provider = 'paystack',
  [Parameter(Mandatory=$false)] [string] $secret = $env:WEBHOOK_TEST_SECRET,
  [Parameter(Mandatory=$false)] [string] $url = "http://localhost:3000/api/v1/webhooks/$provider",
  [Parameter(Mandatory=$false)] [string] $file = ''
)

if (-not $secret) {
  Write-Error "Provide a secret via --secret or set WEBHOOK_TEST_SECRET env var"
  exit 1
}

$args = @("--provider=$provider", "--secret=$secret", "--url=$url")
if ($file) { $args += "--file=$file" }

node .\scripts\send_webhook.js $args
