Escrow ⇢ Paystack Integration Test

Purpose
- Simple script to exercise the escrow create and release endpoints and trigger server-side Paystack remittance.

Prerequisites
- Backend running and reachable at `BASE_URL` (default: `http://localhost:3000/api/v1`).
- A test buyer account and bearer token with sufficient balance and PIN.
- (Optional) `PAYSTACK_SECRET_KEY` set in your backend environment to point at a staging Paystack secret key.

Env vars used by the script
- `BASE_URL` - API root (include versioning if needed), e.g. `http://localhost:3000/api/v1`
- `TEST_BUYER_TOKEN` - Bearer token for buyer
- `SELLER_IDENTIFIER` - Seller username or phone
- `AMOUNT` - Escrow amount (number)
- `PIN` - Buyer PIN used for creating escrow

Run

PowerShell / CMD:

```powershell
$env:BASE_URL='http://localhost:3000/api/v1'
$env:TEST_BUYER_TOKEN='Bearer ...'
$env:SELLER_IDENTIFIER='seller_username'
$env:AMOUNT='10'
$env:PIN='1234'
node tools/integration/escrow_paystack_test.js
```

Bash:

```bash
BASE_URL='http://localhost:3000/api/v1' TEST_BUYER_TOKEN='Bearer ...' SELLER_IDENTIFIER='seller_username' AMOUNT=10 PIN=1234 node tools/integration/escrow_paystack_test.js
```

Notes
- If your backend Paystack secret is configured, the server will attempt real transfers to the recipient (we recommend using a Paystack staging account).
- The script prints responses but does not confirm Paystack transfer completion — check your Paystack dashboard or webhooks to validate.
- If you want me to run this from the workspace, provide a staging `PAYSTACK_SECRET_KEY` and a `TEST_BUYER_TOKEN` (or tell me to run in mock mode).