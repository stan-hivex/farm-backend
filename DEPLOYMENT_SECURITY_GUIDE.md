# Security Hardening Deployment Guide

**Last Updated**: 2026-06-26  
**Version**: 1.0  
**Status**: Ready for Production Deployment

---

## 📋 Pre-Deployment Checklist

### ✅ Code Changes Verification
```bash
# Verify all security fixes are in place
git diff main -- src/auth/auth.service.ts | grep -i "secret\|pin\|jwt"
git log --oneline | grep -i "security\|encrypt\|audit"

# Check files were created
ls -la src/config/environment-validation.ts
ls -la src/common/encryption/
ls -la src/common/audit/
ls -la src/common/security/api-key-hash.service.ts
```

### ✅ Environment Secrets Generated
```bash
# Generate all required secrets (DO NOT use these - generate your own)
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QR_HMAC_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
FIELD_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "Save these to .env.production (SECURE - never commit!)"
echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET"
echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
echo "QR_HMAC_SECRET=$QR_HMAC_SECRET"
echo "FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY"

# Verify secrets meet minimum requirements
echo "JWT_ACCESS_SECRET length: $(echo -n $JWT_ACCESS_SECRET | wc -c) (must be 64)"
echo "QR_HMAC_SECRET length: $(echo -n $QR_HMAC_SECRET | wc -c) (must be 64)"
```

### ✅ Database Migrations Ready
```bash
# 1. Backup current database
pg_dump farm > backup_before_security_migration_$(date +%Y%m%d_%H%M%S).sql

# 2. Review migration script
cat DATABASE_SECURITY_MIGRATION.sql

# 3. Apply migration (in staging FIRST)
psql farm < DATABASE_SECURITY_MIGRATION.sql

# 4. Verify tables created
psql farm -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs';"

# 5. Verify columns added
psql farm -c "SELECT column_name FROM information_schema.columns WHERE table_name='api_keys' AND column_name='api_key_hash';"
```

### ✅ Tests Pass
```bash
# Run security tests
npm run test -- test/security-hardening.spec.ts

# Run all tests
npm run test

# Check coverage
npm run test:cov

# Verify no hardcoded secrets in code
grep -r "'secret'" src/ || echo "✓ No hardcoded secrets found"
grep -r '"secret"' src/ || echo "✓ No hardcoded secrets found"
grep -r "farm-secret" src/ || echo "✓ No default secrets found"
```

### ✅ Build Succeeds
```bash
# Clean build
rm -rf dist/
npm run build

# Verify build output
test -d dist && echo "✓ Build successful" || echo "✗ Build failed"
```

---

## 🚀 Deployment Steps (Staging First)

### Phase 1: Staging Deployment

**1. Deploy Code to Staging**
```bash
git checkout security-hardening
git pull origin security-hardening

npm install
npm run build

# Deploy Docker image
docker build -f Dockerfile.production -t farm-backend:security-hardening .
docker-compose -f docker-compose.production.yml up -d
```

**2. Run Database Migration on Staging**
```bash
# SSH into staging
ssh staging.farm.local

# Backup database
pg_dump farm > backup_staging_$(date +%Y%m%d).sql

# Apply migration
psql farm < /path/to/DATABASE_SECURITY_MIGRATION.sql

# Verify
psql farm -c "SELECT COUNT(*) FROM audit_logs;"
```

**3. Verify Environment Validation**
```bash
# Test 1: App should start with valid secrets
JWT_ACCESS_SECRET=aaa...aaa npm run start
# Should start successfully ✓

# Test 2: App should fail without JWT_ACCESS_SECRET
unset JWT_ACCESS_SECRET
npm run start
# Should crash with error ✓
```

**4. Test PIN Reset Flow**
```bash
# Users will see PIN_RESET_REQUIRED
# Test setting new PIN with fixed algorithm
curl -X POST http://staging/api/auth/set-pin \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"pin": "1234"}'
# Should succeed ✓
```

**5. Test API Key Hashing**
```bash
# Generate new API key
curl -X POST http://staging/api/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Use API key
curl http://staging/api/protected \
  -H "X-API-Key: <returned-key>"
# Should work ✓
```

**6. Test Audit Logging**
```bash
# Create audit event
curl -X DELETE http://staging/api/admin/users/user-id \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check audit logs
curl http://staging/api/admin/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Should show delete event ✓
```

**7. Run E2E Tests**
```bash
npm run test:e2e

# All should pass ✓
```

**8. Security Scanning**
```bash
# Check for known vulnerabilities
npm audit

# OWASP scanning
npm run test:security

# Static analysis
npm run lint
```

### Phase 2: Production Deployment (Blue-Green)

**1. Prepare Production Environment**
```bash
# Ensure secrets are set in production
echo "Checking production secrets..."
test -n "$JWT_ACCESS_SECRET" && echo "✓ JWT_ACCESS_SECRET set" || echo "✗ JWT_ACCESS_SECRET missing"
test -n "$JWT_REFRESH_SECRET" && echo "✓ JWT_REFRESH_SECRET set" || echo "✗ JWT_REFRESH_SECRET missing"
test -n "$QR_HMAC_SECRET" && echo "✓ QR_HMAC_SECRET set" || echo "✗ QR_HMAC_SECRET missing"
test -n "$FIELD_ENCRYPTION_KEY" && echo "✓ FIELD_ENCRYPTION_KEY set" || echo "✗ FIELD_ENCRYPTION_KEY missing"
```

**2. Database Backup & Migration**
```bash
# Full backup before migration
pg_dump -h prod.db.farm.local farm > backup_prod_before_security_$(date +%Y%m%d_%H%M%S).sql

# Store backup securely
aws s3 cp backup_prod*.sql s3://farm-backups/

# Test restore (optional, in separate database)
psql -h test.db.farm.local farm_test < backup_prod_*.sql

# Apply migration to production
psql -h prod.db.farm.local farm < DATABASE_SECURITY_MIGRATION.sql
```

**3. Blue-Green Deployment**
```bash
# Build new image (green)
docker build -f Dockerfile.production -t farm-backend:security-hardening .

# Push to registry
docker tag farm-backend:security-hardening $REGISTRY/farm-backend:security-hardening
docker push $REGISTRY/farm-backend:security-hardening

# Deploy to green environment (parallel to blue)
docker-compose -f docker-compose.green.yml up -d

# Run tests against green
curl http://green.api.farm.local/health
npm run test:e2e --url http://green.api.farm.local

# If tests pass, switch traffic
# Update load balancer: route 100% to green
aws elbv2 modify-listener --load-balancer-arn ... --target-group-arn ... 

# Monitor for 30 minutes
# If no issues, keep green as new production
# If issues, revert traffic back to blue
```

**4. Post-Deployment Verification**
```bash
# Verify API is responding
curl -I https://api.farm.local/health

# Check application logs
tail -f /var/log/farm-backend/app.log

# Verify authentication still works
curl -X POST https://api.farm.local/api/auth/login \
  -d '{"email": "test@farm.local", "password": "password"}'

# Verify audit logging works
curl https://api.farm.local/api/admin/audit-logs \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | .action' | head -20

# Check error logs for JWT errors (should be none if migration succeeded)
grep "JWT_SECRET" /var/log/farm-backend/error.log || echo "✓ No secret errors"
```

---

## 🔄 Rollback Procedure (If Issues)

### Immediate Rollback (Traffic)
```bash
# If users are experiencing issues:

# Option 1: Revert to blue (old version)
aws elbv2 modify-listener --load-balancer-arn ... --target-group-arn blue

# Option 2: Emergency: Scale down green
docker-compose -f docker-compose.green.yml down

# Check logs for errors
docker logs farm-backend-green 2>&1 | tail -100
```

### Database Rollback (If Migration Failed)
```bash
# DO NOT delete audit_logs table if it has data
# Instead, just revert the code and restart

# To completely rollback database:
psql farm << EOF
  -- ONLY IF MIGRATION FAILED
  DROP TABLE IF EXISTS audit_logs CASCADE;
  DROP TABLE IF EXISTS security_events CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS phone_encrypted;
  ALTER TABLE users DROP COLUMN IF EXISTS pin_reset_required;
  ALTER TABLE api_keys DROP COLUMN IF EXISTS api_key_hash;
EOF

# Restore from backup if needed
psql farm < backup_prod_before_security_*.sql
```

---

## 📊 Monitoring After Deployment

### Health Checks (Continuous)
```bash
# Application health
curl https://api.farm.local/health

# Authentication working
curl -X POST https://api.farm.local/api/auth/login -d '{...}' | jq '.accessToken'

# Webhook processing
curl https://api.farm.local/metrics | grep webhook_queue_depth

# Audit logging
curl https://api.farm.local/api/admin/audit-logs | jq '.length'
```

### Error Monitoring
```bash
# Watch for JWT errors (should be none)
tail -f /var/log/farm-backend/app.log | grep -i jwt

# Watch for decryption errors (should be none)
tail -f /var/log/farm-backend/app.log | grep -i decrypt

# Watch for audit log failures
tail -f /var/log/farm-backend/app.log | grep -i audit
```

### Performance Baseline
Monitor these metrics compared to pre-deployment:
- API response time (encryption/decryption adds ~10-20ms)
- Database query time (audit logging adds queries)
- CPU usage (encryption is CPU-bound)
- Memory usage (should be minimal increase)

```bash
# Set alerts if metrics exceed:
- API latency p95 > 1000ms (vs ~500ms baseline)
- Database response time > 1000ms (vs ~100ms baseline)
- CPU > 80% (vs ~40% baseline)
```

---

## 🔐 Post-Deployment Security Actions

### 1. Force PIN Reset
```bash
# All users who set PIN before will need to reset
UPDATE users SET pin_reset_required = TRUE WHERE pin_hash IS NOT NULL;

# Notification to users
-- Send email: "For security, please reset your PIN on next login"
```

### 2. Rotate API Keys (Optional)
```bash
# Option 1: Expire old keys
UPDATE api_keys SET expires_at = NOW() + INTERVAL '30 days';

# Option 2: Keep existing keys but hash them
-- See DATABASE_SECURITY_MIGRATION.sql for how to migrate existing keys
```

### 3. Enable Audit Log Monitoring
```bash
# Set up alerts for suspicious admin activity
-- Unusual number of user deletions
SELECT COUNT(*) as delete_count 
FROM audit_logs 
WHERE action = 'DELETE_USER' 
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY admin_id;

-- Failed login attempts
SELECT COUNT(*) as failed_logins, user_id
FROM security_events
WHERE event_type = 'failed_login'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id;
```

### 4. Document Changes
```bash
# Update deployment documentation
# Update security.md
# Update incident response playbooks
# Train team on new audit logging procedures
```

---

## 📝 Verification Checklist Before Go-Live

- [ ] All security tests pass
- [ ] Database migration applied and verified
- [ ] Environment variables set in production
- [ ] No hardcoded secrets in code
- [ ] Audit logs table created and populated
- [ ] API key hashing implemented and tested
- [ ] PIN hashing fixed and users notified
- [ ] Field encryption working (test with sample data)
- [ ] Load balancer ready for blue-green
- [ ] Rollback procedure documented and tested
- [ ] Team trained on new procedures
- [ ] On-call team briefed on changes
- [ ] Monitoring/alerting configured
- [ ] Backup verified and restorable
- [ ] Incident response playbook updated

---

## 🚨 Troubleshooting Common Issues

### Issue: "JWT_ACCESS_SECRET not configured"
**Cause**: Environment variable not set  
**Fix**:
```bash
export JWT_ACCESS_SECRET=<your-64-char-secret>
npm run start
```

### Issue: API key comparison failing
**Cause**: Old API keys stored as plaintext, not hashed  
**Fix**:
```bash
# Regenerate all API keys (users will need new ones)
DELETE FROM api_keys;
-- Generate new keys with ApiKeyHashService.generateAndHashKey()
```

### Issue: Decryption errors on old phone numbers
**Cause**: Data encrypted with different key  
**Fix**:
```bash
# If key was rotated, need to decrypt with old key, re-encrypt with new
-- Requires manual data migration
```

### Issue: Audit logs not populating
**Cause**: AuditLogService not injected in admin controller  
**Fix**:
```typescript
constructor(private audit: AuditLogService) {}

async deleteUser(userId: string, @Req() req: Request) {
  await this.audit.logUserDeletion(req.user.id, userId, req.ip);
}
```

---

## 📞 Support & Escalation

**If Issues Arise**:
1. Check application logs: `/var/log/farm-backend/app.log`
2. Check database: `psql farm -c "SELECT * FROM security_events LIMIT 10;"`
3. Rollback to blue (see Rollback section)
4. Contact security team: security@farm.local

**Security Concerns Post-Deployment**:
- Email: security@farm.local
- Slack: #security-incidents
- On-Call: Use PagerDuty

---

**Deployment approved by**: _________________  
**Date**: ________________  
**Version deployed**: security-hardening v1.0
