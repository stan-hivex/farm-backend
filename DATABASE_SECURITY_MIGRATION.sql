-- Database Security Enhancements Migration
-- Apply these migrations to harden database security

-- ============================================================
-- 1. Add audit logging table (immutable, compliance tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);

-- Make audit logs immutable (no delete/update)
-- Only superuser can modify
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Add encrypted field columns for PII
-- ============================================================

-- Phone encryption
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE users ADD CONSTRAINT unique_phone_encrypted UNIQUE (phone_encrypted) DEFERRABLE INITIALLY DEFERRED;

-- Email encryption (optional)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
ALTER TABLE users ADD CONSTRAINT unique_email_encrypted UNIQUE (email_encrypted) DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- 3. Add API key hashing column
-- ============================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_key_hash ON api_keys(api_key_hash);

-- ============================================================
-- 4. Add security tracking columns
-- ============================================================

-- Track PIN resets (until new PIN set with fixed hashing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_reset_required BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT FALSE;

-- Track when secrets were rotated
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS last_secret_rotation TIMESTAMP;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS encryption_key_version INT DEFAULT 1;

-- ============================================================
-- 5. Fix PIN hashes - clear old weak hashes
-- ============================================================

-- Clear all PIN hashes (they're using wrong algorithm: pin + userId)
-- Users will be forced to set PIN again
UPDATE users SET pin_hash = NULL, failed_pin_attempts = 0, pin_reset_required = TRUE;

-- ============================================================
-- 6. Add security event logging table
-- ============================================================

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,  -- token_theft, brute_force, unusual_activity
  user_id UUID REFERENCES users(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  severity VARCHAR(10) NOT NULL,  -- low, medium, high, critical
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);

-- ============================================================
-- 7. Add webhook log immutability constraints
-- ============================================================

ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- After processing, lock the log to prevent modification
UPDATE webhook_logs SET locked = TRUE WHERE created_at < NOW() - INTERVAL '1 hour';

-- ============================================================
-- 8. Database connection security
-- ============================================================

-- Force SSL connections (depends on hosting provider)
-- ALTER SYSTEM SET ssl = on;
-- SELECT pg_reload_conf();

-- ============================================================
-- 9. Create role for application (principle of least privilege)
-- ============================================================

-- Create separate role for app (if not using superuser)
-- CREATE ROLE farm_app_user WITH LOGIN PASSWORD 'secure_password';
-- GRANT CONNECT ON DATABASE farm TO farm_app_user;

-- Grant specific permissions (minimal access)
-- GRANT SELECT, INSERT, UPDATE ON users TO farm_app_user;
-- GRANT SELECT, INSERT ON audit_logs TO farm_app_user;
-- DENY DELETE, UPDATE ON audit_logs TO farm_app_user;

-- ============================================================
-- 10. Row-level security for sensitive operations
-- ============================================================

-- Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_self_select ON users
  FOR SELECT
  USING (id = current_user_id OR role = 'admin');

-- Audit logs: read-only for admins, not accessible to users
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT
  USING (role = 'admin');  -- Assumes role stored in users table

-- ============================================================
-- 11. Sensitive data retention policy
-- ============================================================

-- Optional: Automatically delete sensitive logs after 90 days
-- Note: Adjust based on compliance requirements
-- DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '90 days' AND status = 'success';

-- ============================================================
-- Migration Rollback Instructions
-- ============================================================

/*
-- To rollback these changes:
-- (Only do if you need to revert)

-- DROP TABLE IF EXISTS audit_logs;
-- DROP TABLE IF EXISTS security_events;
-- ALTER TABLE users DROP COLUMN IF EXISTS phone_encrypted;
-- ALTER TABLE users DROP COLUMN IF EXISTS email_encrypted;
-- ALTER TABLE users DROP COLUMN IF EXISTS pin_reset_required;
-- ALTER TABLE api_keys DROP COLUMN IF EXISTS api_key_hash;
-- DROP INDEX IF EXISTS idx_audit_admin_id;
-- DROP INDEX IF EXISTS idx_api_key_hash;

*/

-- ============================================================
-- Verification Queries
-- ============================================================

-- Verify audit_logs table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'audit_logs';

-- Verify api_key_hash column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'api_keys' AND column_name = 'api_key_hash';

-- Verify encrypted columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name LIKE '%encrypted%';

-- Count audit logs (should be empty initially)
SELECT COUNT(*) FROM audit_logs;

-- Check for PIN hashes (should be NULL after migration)
SELECT COUNT(*) FROM users WHERE pin_hash IS NOT NULL;
