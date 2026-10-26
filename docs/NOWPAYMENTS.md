# NOWPayments integration

Configure these secrets in the backend deployment environment; do not commit
their values:

- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_EMAIL`
- `NOWPAYMENTS_PASSWORD`
- `NOWPAYMENTS_IPN_CALLBACK_URL`
- `NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL`

Use public HTTPS callback URLs:

- `NOWPAYMENTS_IPN_CALLBACK_URL=https://<backend-host>/api/v1/webhooks/nowpayments`
- `NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL=https://<backend-host>/api/v1/webhooks/nowpayments-payout`

The payout callback can be derived from the payment callback when the latter
ends with `/webhooks/nowpayments`; setting both explicitly is recommended.

## API routes

- `GET /api/v1/wallet/deposit/crypto/currencies`
- `GET /api/v1/wallet/deposit/crypto/minimum/:currency` to retrieve the
  current NOWPayments minimum for the selected asset and its USD equivalent
- `POST /api/v1/wallet/deposit/crypto` with `price_amount`, `price_currency`
  (`usd`), and `pay_currency`. The backend checks the requested USD amount
  against NOWPayments' current minimum for that asset; the minimum is not a
  fixed USD amount.
- `GET /api/v1/wallet/deposit/status/:paymentId`
- `GET /api/v1/withdraw/crypto/currencies`
- `GET /api/v1/withdraw/crypto/minimum` returns the USD 1 minimum and its
  current FARM equivalent before the 1.5% withdrawal fee
- `POST /api/v1/withdraw/crypto` with the crypto amount in FARM, destination
  address, asset/currency, transaction PIN or verified biometric details
- `GET /api/v1/qr-payments/crypto-options`
- `POST /api/v1/qr-payments/initialize` with the merchant, KES amount, method,
  email, and selected `crypto` currency

Crypto withdrawals reserve the FARM balance until an administrator approves
the payout. Admin routes are `GET /api/v1/admin/crypto-withdrawals/pending`,
`POST /api/v1/admin/crypto-withdrawals/:reference/approve`, and
`POST /api/v1/admin/crypto-withdrawals/:reference/verify`.
The client takes the requested crypto withdrawal in USD and converts it to
FARM using the current rate before submitting. The backend enforces a minimum
gross value of USD 1, deducts the 1.5% fee, and credits that fee to the
superadmin wallet after the payout completes. NOWPayments' currency-specific
payout minimum still applies and can require more than USD 1 for some assets.

## Settlement

Both webhook routes verify `x-nowpayments-sig` as HMAC-SHA512 using
`NOWPAYMENTS_IPN_SECRET` and NOWPayments' recursively key-sorted JSON payload.
The backend then fetches the payment or payout status with the API key before
settling. Deposits and merchant QR payments settle only for authenticated
`confirmed` or `finished` payment statuses; repeated notifications are
idempotent. Payouts debit the reserved balance only after provider confirmation
and release the reservation if NOWPayments reports a terminal failure.

The client status endpoints are for display and reconciliation; only server
verification can credit a wallet.
