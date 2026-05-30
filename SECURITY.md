# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email: security@hivexx.farm

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

We will respond within 48 hours and aim to release a patch within 7 days
for critical issues.

## Security Measures in Place

- JWT RS256 tokens with 15-minute expiry and refresh rotation
- bcrypt PIN hashing with per-user salts
- HMAC-SHA512 webhook signature verification (Paystack)
- Rate limiting at Nginx and application layer
- Idempotency middleware prevents double-spend on retries
- All financial operations require PIN verification
- Audit logging on all admin, KYC, and payment actions
- Request ID tracing across all logs
- TLS 1.3 enforced at Nginx
- HSTS with 1-year max-age

## Responsible Disclosure

We follow coordinated disclosure. Researchers who report valid
vulnerabilities will be credited in our changelog (unless they prefer
to remain anonymous).