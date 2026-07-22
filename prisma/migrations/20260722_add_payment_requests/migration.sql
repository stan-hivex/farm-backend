-- Create payment_request_status enum
DO $$ BEGIN
    CREATE TYPE payment_request_status AS ENUM ('pending','accepted','rejected','expired','completed','cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment_requests table
CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference varchar(255) UNIQUE NOT NULL,
  requester_user_id uuid,
  requester_wallet_id uuid,
  recipient_user_id uuid,
  recipient_wallet_id uuid,
  amount numeric(30,8) NOT NULL,
  currency varchar(20) DEFAULT 'FARM',
  description text,
  status payment_request_status DEFAULT 'pending',
  transaction_id uuid UNIQUE,
  expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  ip_address varchar(100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS payment_requests
  ADD CONSTRAINT fk_payment_requests_requester_user FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE IF EXISTS payment_requests
  ADD CONSTRAINT fk_payment_requests_recipient_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE IF EXISTS payment_requests
  ADD CONSTRAINT fk_payment_requests_requester_wallet FOREIGN KEY (requester_wallet_id) REFERENCES wallets(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE IF EXISTS payment_requests
  ADD CONSTRAINT fk_payment_requests_recipient_wallet FOREIGN KEY (recipient_wallet_id) REFERENCES wallets(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE IF EXISTS payment_requests
  ADD CONSTRAINT fk_payment_requests_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_payment_requests_requester ON payment_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient ON payment_requests(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
