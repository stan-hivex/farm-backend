# Production Readiness: FARM Stack Audit

**Date:** 2026-06-25  
**Status:** ⚠️ **CONDITIONAL FOR PRODUCTION** (6.4/10)  
**Verdict:** Backend has solid fundamentals but critical gaps. Frontend has severe security issues.

---

## Executive Summary

Your application is **ready for staging only**. Before production, you must address:

- 🔴 **Backend**: Test coverage (2% → must be 50%), environment validation, monitoring
- 🔴 **Frontend**: Token storage security, app signing, certificate pinning, error handling
- 🟠 **Both**: Comprehensive E2E testing, monitoring setup, graceful shutdown

**Estimated effort to production-ready:** 2-3 weeks with 2 engineers.

---

## Backend Assessment (6.4/10)

### ✅ Strengths
- **Security**: Helmet, HSTS, JWT, API keys, webhook signature verification, CORS, rate limiting (20 req/60s)
- **Error Handling**: Global exception filter, graceful degradation, idempotency middleware
- **Database**: Type-safe Prisma, transactions for financial ops, proper schema design
- **Deployment**: Docker optimized, health checks, migrations, environment externalized

### ❌ Critical Issues (Block Production)

#### 1. **Test Coverage < 15%** (Score: 2/10)
**Impact**: Cannot verify core financial logic  
**Files at Risk**: 
- `src/payments/payments.service.ts` - Payment processing untested
- `src/withdraw/withdraw.service.ts` - Withdrawal state machine untested
- `src/auth/auth.service.ts` - Auth flows incomplete

**Fix**: Add 20+ E2E tests covering:
```
✓ User registration → KYC → approval
✓ Deposit flow (Paystack + Ivorypay)
✓ Withdrawal flow + state machine
✓ Rate limiting verification
✓ Webhook replay protection
✓ Auth token refresh
✓ Redis failure fallback
```

#### 2. **Environment Variables Not Validated** (Score: 5/10)
**Impact**: App can start with missing secrets, fail at runtime  
**Current**: Only `DATABASE_URL` required  
**Missing**: `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `IVORYPAY_SECRET`

**Fix**: Add to `src/config/environment.ts`:
```typescript
export const validateEnv = () => {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PAYSTACK_SECRET_KEY',
    'IVORYPAY_SECRET',
    'REDIS_URL',
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env: ${key}`);
    }
  }
};

// Call in main.ts before app.listen()
```

#### 3. **No Monitoring/Observability** (Score: 0/10)
**Impact**: Blind to production issues until users report  
**Missing**: Prometheus metrics, distributed tracing, error alerts

**Fix**:
- Add Sentry: `npm install @sentry/nestjs`
- Add Prometheus: `npm install prom-client`
- Configure alerting for payment failures, auth errors, webhook processing lag

#### 4. **Webhook Processing Edge Cases** (Score: 6/10)
**Impact**: Potential duplicate processing if Redis fails  
**Issues**: 
- Signature verified twice (guard + service)
- Replay detection depends on Redis (no fallback)
- Previous fixes suggest ongoing instability

**Fix**: Review webhook flow, test offline scenarios, add DLQ for failed webhooks

### 🟠 High-Priority Gaps (Fix Within 1 Week)

| Issue | Effort | Impact |
|-------|--------|--------|
| Add request timeout (30s default) | 1hr | Prevents hung requests |
| Implement graceful shutdown (SIGTERM) | 1.5hrs | Clean resource cleanup |
| Add readiness probe | 30min | Proper health checks |
| Verify KYC bypass paths | 2hrs | Security audit |
| Test rate limiting bypass | 1hr | Auth security |

---

## Frontend Assessment (3.5/10)

### 🔴 CRITICAL Security Issues (Block All Releases)

#### 1. **Unencrypted Token Storage**
**Current**: AccessToken/RefreshToken in `SharedPreferences` (plain text)  
**Risk**: Any app can read tokens via platform channels  
**Fix**: Use `flutter_secure_storage` (encrypted keychain/keystore)

```dart
// Current (WRONG)
FFAppState().accessToken = data['access_token'];

// Correct
final storage = FlutterSecureStorage();
await storage.write(key: 'access_token', value: token);
```

#### 2. **Release Build Uses Debug Signing Keys**
**Current**: `signingConfig signingConfigs.debug` in release build  
**Risk**: Play Store will reject; anyone can forge your app  
**Fix**: Configure proper keystore in `android/app/build.gradle`:

```gradle
android {
  signingConfigs {
    release {
      keyStore file("../keystore.jks")
      keyStorePassword System.getenv("KEYSTORE_PASSWORD")
      keyAlias System.getenv("KEY_ALIAS")
      keyPassword System.getenv("KEY_PASSWORD")
    }
  }
  
  buildTypes {
    release {
      signingConfig signingConfigs.release
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
  }
}
```

#### 3. **No Certificate Pinning**
**Risk**: MITM attacks intercept API traffic  
**Fix**: Use `http_certificate_pinning` package:

```dart
final client = HttpClientWithCertificatePinning();
await client.pinPublicKey(
  publicKeyPin: 'sha256/YOUR_PIN_HERE',
  host: 'api.yourdomain.com',
);
```

#### 4. **Missing Network Security Config (Android)**
**Risk**: Cleartext HTTP traffic allowed  
**Fix**: Create `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<network-security-config>
  <domain-config>
    <domain includeSubdomains="true">api.yourdomain.com</domain>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
    <pin-set>
      <pin digest="SHA-256">YOUR_CERT_PIN</pin>
    </pin-set>
  </domain-config>
</network-security-config>
```

#### 5. **No Centralized Error Handling**
**Risk**: No retry logic, no timeout config, inconsistent error UX  
**Fix**: Create `lib/services/api_client.dart`:

```dart
class ApiClient {
  static const int MAX_RETRIES = 3;
  static const Duration TIMEOUT = Duration(seconds: 30);
  
  Future<http.Response> request(
    String url, {
    required String method,
    Map<String, String>? headers,
    dynamic body,
  }) async {
    for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        final response = await http
            .request(method, Uri.parse(url),
                headers: headers, body: body)
            .timeout(TIMEOUT);
        
        if (response.statusCode == 200) return response;
        if (response.statusCode == 401) await _refreshToken();
        if (response.statusCode >= 500 && attempt < MAX_RETRIES - 1) {
          await Future.delayed(Duration(milliseconds: 100 * (2 ^ attempt)));
          continue;
        }
        
        throw ApiException(response.statusCode, response.body);
      } catch (e) {
        if (attempt == MAX_RETRIES - 1) rethrow;
        await Future.delayed(Duration(milliseconds: 100 * (2 ^ attempt)));
      }
    }
  }
}
```

### ❌ Testing: 0% Coverage
- **Unit Tests**: 0 for business logic
- **Widget Tests**: 1 placeholder test
- **Integration Tests**: 0

**Fix**: Add tests for:
- Auth flow (login, token refresh)
- Deposit submission
- Withdrawal request
- Transaction history
- Offline detection

### ❌ Architecture Issues
- **State Management**: Only Provider + SharedPreferences (no offline-first)
- **No Dependency Injection**: Services instantiated manually
- **Heavy FlutterFlow Code**: Generated code is hard to maintain
- **No Environment Separation**: API endpoints hardcoded

**Fix**: 
- Add `get_it` for DI
- Create separate configs for dev/staging/prod
- Extract business logic from UI code
- Add local SQLite caching for offline support

### 🟠 Deployment Blockers
- No CI/CD pipeline (manual builds)
- No version management strategy
- No backup/rollback plan
- No metrics/crash reporting

---

## DEPLOYMENT CHECKLIST

### 🔴 MUST FIX BEFORE ANY RELEASE

**Backend:**
- [ ] Add environment variable validation
- [ ] Add 5+ critical path E2E tests
- [ ] Configure Sentry error tracking
- [ ] Add Prometheus metrics
- [ ] Test graceful shutdown
- [ ] Verify idempotency middleware works offline

**Frontend:**
- [ ] Migrate tokens to `flutter_secure_storage`
- [ ] Configure proper release app signing
- [ ] Implement certificate pinning
- [ ] Add centralized API client with retry logic
- [ ] Add error handling UI (not just SnackBar)
- [ ] Add request timeout configuration

**Infrastructure:**
- [ ] Set up staging environment
- [ ] Configure database backups
- [ ] Document rollback procedure
- [ ] Set up monitoring alerts
- [ ] Configure log aggregation

### 🟠 FIX WITHIN 1 WEEK

**Backend:**
- [ ] Add request timeout middleware (30s)
- [ ] Implement graceful shutdown (SIGTERM + 30s grace)
- [ ] Add readiness probe separate from liveness
- [ ] Add slow query logging to PostgreSQL
- [ ] Document deployment runbook

**Frontend:**
- [ ] Add comprehensive error screens
- [ ] Add offline mode UI
- [ ] Add retry mechanism for failed API calls
- [ ] Configure Firebase Crashlytics
- [ ] Set up Android ProGuard/R8 rules

---

## Testing Strategy

### Backend (Target: 50% coverage)

**Priority 1 - Critical Paths (4-6 hours)**
```bash
# Create test/e2e/critical-paths.e2e-spec.ts
✓ POST /auth/register → user created
✓ POST /auth/login → token returned
✓ POST /deposits → webhook triggers
✓ POST /withdrawals → state machine starts
✓ GET /health → 200 OK
```

**Priority 2 - Integration Tests (4-6 hours)**
```bash
# Test each module with database
✓ AuthService: signup, login, token refresh
✓ DepositService: create, validate, finalize
✓ WithdrawService: create, approve, process
✓ WebhookService: replay detection, signature verification
✓ PaymentsService: Paystack + Ivorypay flows
```

**Priority 3 - Unit Tests (4-6 hours)**
```bash
# Test individual functions
✓ Validation: email, phone, amounts
✓ Crypto: signing, verification
✓ Utils: formatters, parsers
✓ Guards: auth, role-based
✓ Middleware: rate limiting, idempotency
```

### Frontend (Target: 60% coverage)

**Priority 1 - Auth Flows (3 hours)**
```dart
testWidgets('Login → Dashboard flow', (WidgetTester tester) async {
  // Mock API responses
  // Test: enter credentials → submit → validate token → navigate
});

testWidgets('Token refresh on 401', (WidgetTester tester) async {
  // Test: auto-refresh when token expires
});
```

**Priority 2 - Critical Transactions (3 hours)**
```dart
testWidgets('Complete deposit flow', (WidgetTester tester) async {
  // Test: select amount → payment method → confirm → success
});

testWidgets('Withdrawal state transitions', (WidgetTester tester) async {
  // Test: pending → approved → processing → completed
});
```

**Priority 3 - Error Scenarios (2 hours)**
```dart
testWidgets('Network error retry', (WidgetTester tester) async {
  // Test: API fails → retry button appears → succeeds on retry
});

testWidgets('Offline mode detection', (WidgetTester tester) async {
  // Test: no internet → offline UI shown
});
```

---

## Monitoring Setup

### Backend Metrics (Prometheus)

```typescript
// Track these metrics
- HTTP request latency (histogram)
- Payment processing time (histogram)
- Failed webhooks (counter)
- Redis connection status (gauge)
- Database query time (histogram)
- Queue depth (gauge)
```

### Alerting Rules

```yaml
# Alert if:
- Payment failure rate > 1% in 5min
- Webhook processing lag > 60s
- Redis unavailable for > 1min
- Database response time > 1s
- Authentication failures > 10 per minute
- Deployment: error rate spike > 5%
```

### Frontend Analytics

```dart
// Track in Sentry:
- Login success/failure rate
- Deposit completion rate
- Withdrawal completion rate
- API error distribution
- Crash rate by screen
```

---

## Estimated Timeline

| Phase | Tasks | Duration | Effort |
|-------|-------|----------|--------|
| **Phase 1: Security** | Token storage, signing, pinning | 6-8 hrs | 2 devs |
| **Phase 2: Testing** | E2E tests, unit tests | 12-16 hrs | 2 devs |
| **Phase 3: Monitoring** | Sentry, Prometheus, alerting | 6-8 hrs | 1 dev |
| **Phase 4: Staging** | Full system test, load test | 4-6 hrs | 2 devs |
| **Phase 5: Documentation** | Runbooks, playbooks | 3-4 hrs | 1 dev |
| **Total** | | **2-3 weeks** | |

---

## Deployment Strategy

### Canary Deployment (Recommended)

```
1. Deploy to staging → Run E2E tests
2. Deploy to production (10% traffic)
3. Monitor error rate for 30 minutes
4. If stable: scale to 50% traffic
5. Monitor for 30 minutes
6. If stable: scale to 100% traffic
7. Keep canary version running for 1 hour
8. Automatic rollback if error rate > 5%
```

### Rollback Procedure

```bash
# If issues detected:
1. Check logs for errors
2. Identify problematic deployment
3. Run: docker-compose pull && docker-compose up -d
4. Verify health check passes
5. Run smoke tests
6. Document incident
```

### Database Backup

```bash
# Before each deployment:
pg_dump farm > backup_$(date +%Y%m%d_%H%M%S).sql

# Test restore:
createdb farm_test
psql farm_test < backup_*.sql
```

---

## Go/No-Go Decision Criteria

### ✅ GO if:
- [ ] Test coverage ≥ 50% (backend), ≥ 60% (frontend)
- [ ] All critical security issues fixed
- [ ] E2E tests pass 100% on staging
- [ ] Monitoring alerts configured and tested
- [ ] Database backups validated
- [ ] Team trained on runbook and rollback

### ❌ NO-GO if:
- [ ] Any unresolved security vulnerabilities
- [ ] Test failures in critical path
- [ ] Monitoring not operational
- [ ] Rollback procedure not tested
- [ ] On-call rotation not established

---

## Post-Deployment (72 Hours)

- [ ] Monitor error rate, payment success rate, API latency
- [ ] Check crash reports (Sentry, Firebase Crashlytics)
- [ ] Review webhook processing logs for issues
- [ ] Validate database backups were created
- [ ] Conduct post-mortem if any issues found
- [ ] Document any incidents

---

## Questions?

See `SECURITY_CHECKLIST.md` and `MONITORING.md` in the backend root for more details.
