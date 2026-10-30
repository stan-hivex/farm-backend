-- Additive: short-lived, single-use, backend-signed tap-to-pay requests (NFC HCE / QR fallback).
CREATE TABLE IF NOT EXISTS nfc_payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_user_id   UUID NOT NULL REFERENCES users(id),
  amount          DECIMAL(30,8) NOT NULL CHECK (amount > 0),
  kind            VARCHAR(20) NOT NULL, -- 'merchant' (1% paid by payee) | 'p2p' (transfer rule)
  description     VARCHAR(140),
  expires_at      TIMESTAMPTZ(6) NOT NULL,
  used_at         TIMESTAMPTZ(6),
  payer_user_id   UUID REFERENCES users(id),
  transaction_reference VARCHAR(100),
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfc_req_payee ON nfc_payment_requests(payee_user_id, created_at DESC);
