# Change password & email verification
- `POST /api/v1/auth/change-password` {current_password,new_password,confirm_password}: wrong current → 400, mismatch → 400, success revokes old password (tested).
- Email verification: `POST /auth/email/send-verification` issues a hashed single-use token (table from migration `20261112090000_email_verification_tokens`), emailed via Resend; `POST /auth/verify-email` consumes it (reuse rejected — tested).
- Env: `RESEND_API_KEY`, `RESEND_FROM` (falls back to `SMTP_FROM`), `APP_URL` / `EMAIL_VERIFICATION_URL` for the link. Without Resend the send step fails gracefully.
- OTPs are stored hashed with `OTP_HASH_SECRET` (migration `20261114090000_fresh_db_reconcile_and_otp_hash`).
