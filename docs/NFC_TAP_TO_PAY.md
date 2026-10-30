# Tap to pay (NFC HCE, QR fallback)

Off by default. Turn it on with `NFC_PAY_ENABLED=true`. Signing uses `NFC_PAY_SECRET` (falls back to `JWT_SECRET`; must be at least 16 characters).

## Flow
1. **Payee** `POST /api/v1/nfc-pay/requests {amount, description?, ttl_seconds? (15–120, default 60)}` returns `{id, token, expires_at, kind, payer_fee, merchant_fee, ...}`.
   - The token is `farmpay1.<id>.<exp>.<HMAC-SHA256>`. It holds no amount and no payee.
   - `kind` is decided by the server: a payee with an approved business is `merchant` (merchant fee, default 1%, paid by the merchant). Everyone else is `p2p` (transfer rule, default 0%).
2. The payee's Android phone emits `token` via HCE (NDEF URI `farmpay:<token>`). On iOS, or when NFC is off or unsupported, the app shows the same token as a QR code.
3. **Payer** reads the tag or QR and calls `GET /nfc-pay/resolve?token=`. The backend verifies the signature, expiry and single use, and returns the payee, the amount and the exact fee **from the DB**.
4. The payer confirms with their PIN: `POST /nfc-pay/pay {token, pin}`.
   - An atomic claim (`used_at IS NULL AND expires_at > now`) is followed by `WalletsService.sendFunds` (PIN, limits, ledger, merchant fee).
   - On failure (wrong PIN, low balance) the claim is released, so the payer can retry before expiry.
   - Replay by the same payer returns the same receipt (`replay: true`). Any other payer gets 409.
5. The payee polls `GET /nfc-pay/requests/:id` (`pending|paid|expired`).

## Security
- Tampering with the id, expiry or signature gives a 400. Expired gives 410. Already used gives 409. Paying your own request gives 400.
- Amounts are never trusted from NFC.
- Tests: `src/nfc-pay/nfc-pay.spec.ts`.

## Needs real-device testing
- HCE emission and reading between two physical Android phones, including the AID routing (`apduservice.xml`), screen-on/unlocked behaviour, and background or foreground dispatch.
- iOS reading an Android HCE tag. Core NFC reads NDEF Type 4 tags. HCE interoperability varies, so the QR fallback is the supported path on iOS.
- Web and emulators have no NFC, so the app shows the QR automatically there.
