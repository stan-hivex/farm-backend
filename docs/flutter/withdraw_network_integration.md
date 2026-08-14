# Flutter integration: provider networks for crypto withdrawals

This doc shows how to fetch provider-authoritative networks from the backend and use the provider `network` value when creating a withdrawal.

Endpoints
- GET /v1/withdraw/crypto/networks?token=USDT|USDC
  - Returns: { data: [{ providerCode: string, displayName: string }] }
- POST /v1/withdraw/create
  - Body: CreateWithdrawDto (include `method: "CRYPTO"`, `cryptoAsset`, `network` (providerCode), `cryptoAddress`, `amount`, `pin`)

Principles
- Present `displayName` to users (friendly label).
- Send `providerCode` (exact string) in the backend `network` field.
- Only allow selections coming from GET `/crypto/networks` (prevents unsupported networks).
- Use the user's JWT for authenticated requests (`Authorization: Bearer <token>`).

pubspec
Add the `http` package (or use your preferred HTTP client):

```yaml
dependencies:
  http: ^0.13.6
```

Notes
- The backend enforces IvoryPay-supported networks and will reject unsupported values.
- Persisted transaction metadata will include `ivorypay_response_body` on failure — useful for debugging.
- Use the `isSupported`/`context` flags from provider output if you fetch directly from Ivorypay; backend already filters to provider networks.

Example usage
- On token change (USDT/USDC) call `GET /v1/withdraw/crypto/networks?token=USDT` and populate UI.
- When user selects a network, store `providerCode` and include it in the `POST /v1/withdraw/create` body as `network`.

If you want, I can produce a PR for your Flutter repo or adapt this example to your app's state management (Provider / Riverpod / Bloc / GetX).