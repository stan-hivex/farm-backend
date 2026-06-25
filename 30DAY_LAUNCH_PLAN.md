# FARM Stack: 30-Day Action Plan to Production

**Prepared:** 2026-06-25  
**Target Go-Live:** ~2026-07-25 (if you start immediately)  
**Team Required:** 2 engineers minimum

---

## Week 1: Fix Critical Issues 🔴 (40 hours)

### Days 1-2: Frontend Security (12 hours)

**Backend Engineer:** Help with environment validation setup  
**Frontend Engineer:** Tackle security fixes

```
□ Day 1 Morning (4 hours)
  └─ Token Storage: Migrate to flutter_secure_storage
     Files: lib/main.dart, lib/services/auth_service.dart
     Read: FRONTEND_HARDENING.md sections 1-2
     Test: Verify tokens not in SharedPreferences (check DevTools)

□ Day 1 Afternoon (4 hours)
  └─ Release Signing: Configure android/app/build.gradle
     Files: android/app/build.gradle, key.properties
     Read: FRONTEND_HARDENING.md section 2
     Generate: Key store with keytool command
     Test: flutter build apk --release (must succeed)

□ Day 2 Morning (4 hours)
  └─ Certificate Pinning: Add http_certificate_pinning package
     Files: lib/services/pinning_http_client.dart, android XML config
     Read: FRONTEND_HARDENING.md section 3
     Get Certificate Pin: From your domain's SSL cert
     Test: Verify MITM protection works
```

### Days 2-3: Backend Security (12 hours)

**Backend Engineer:** Core infrastructure changes  
**Frontend Engineer:** Review and test

```
□ Day 2 Morning (4 hours)
  └─ Environment Validation: Add validateEnvironment()
     Files: src/config/environment.ts, src/main.ts
     Read: BACKEND_HARDENING.md section 1
     Test: npm run build (must fail if JWT_SECRET missing)

□ Day 2 Afternoon (4 hours)
  └─ Request Timeout: Add TimeoutMiddleware
     Files: src/common/middleware/timeout.middleware.ts
     Read: BACKEND_HARDENING.md section 2
     Test: Verify 30s timeout works

□ Day 3 Morning (4 hours)
  └─ Graceful Shutdown: Implement SIGTERM handler
     Files: src/main.ts
     Read: BACKEND_HARDENING.md section 3
     Test: docker stop farmapp (should clean exit)
```

### Days 3-4: Testing Foundation (16 hours)

**Both Engineers:** Pair programming on critical tests

```
□ Day 3 Afternoon (4 hours)
  └─ Backend E2E Tests: Add critical paths test file
     Files: test/e2e/critical-paths.e2e-spec.ts
     Read: BACKEND_HARDENING.md section 4
     Tests to add:
       ✓ POST /auth/register (success + failure)
       ✓ POST /auth/login (success + failure)
       ✓ GET /health (200 OK)
     Test: npm run test:e2e (must pass)

□ Day 4 Morning (4 hours)
  └─ Backend Webhook Tests: Add webhook-specific tests
     Files: test/e2e/webhook-processing.e2e-spec.ts
     Tests to add:
       ✓ Paystack webhook success
       ✓ Replay detection works
       ✓ Invalid signature rejected

□ Day 4 Morning-Afternoon (8 hours)
  └─ Frontend Error Handling: Create ApiClient + error screens
     Files: lib/services/api_client.dart, lib/widgets/error_screen.dart
     Read: FRONTEND_HARDENING.md sections 5-6
     Test: Simulate network failure, verify retry logic
```

### Week 1 Status Check
```
✓ All frontend tokens encrypted
✓ Android release signing configured & tested
✓ Certificate pinning implemented
✓ Backend environment validated at startup
✓ Request timeout middleware working
✓ Graceful shutdown handling SIGTERM
✓ 5+ critical path E2E tests passing
✓ Webhook processing tests covering replay detection
✓ Frontend ApiClient with retry logic working
✓ Error screens shown on failures

Commit to staging branch & create pull request for review
```

---

## Week 2: Monitoring & Observability 🟠 (30 hours)

### Days 5-6: Backend Monitoring (12 hours)

```
□ Day 5 Morning (4 hours)
  └─ Sentry Setup: Add error tracking
     Package: npm install @sentry/nestjs @sentry/tracing
     Files: src/main.ts, .env.production
     Read: BACKEND_HARDENING.md section 5
     Test: Trigger error, verify appears in Sentry dashboard
     Account: sentry.io (free tier fine for MVP)

□ Day 5 Afternoon (4 hours)
  └─ Prometheus Metrics: Add metrics tracking
     Package: npm install prom-client
     Files: src/common/metrics/prometheus.ts, src/metrics.controller.ts
     Read: BACKEND_HARDENING.md section 6
     Metrics to track:
       - HTTP request latency
       - Payment processing time
       - Failed webhooks count
       - Redis connection status
       - Queue depth

□ Day 6 Morning (4 hours)
  └─ Alerting Rules: Configure alerts
     Tool: Grafana (can self-host with docker-compose)
     Alerts:
       • Payment failure rate > 1%
       • Webhook lag > 60s
       • Redis unavailable
       • Database response > 1s
       • Auth failures > 10/min
     Read: PRODUCTION_READINESS.md "Monitoring Setup" section
```

### Days 6-7: Frontend Monitoring (8 hours)

```
□ Day 6 Afternoon (4 hours)
  └─ Firebase Crashlytics: Setup crash reporting
     Read: FRONTEND_HARDENING.md section 7
     Test: Trigger crash, verify in Crashlytics
     Track:
       - Crash-free users %
       - Most common crashes
       - Affected user versions

□ Day 7 Morning (4 hours)
  └─ Analytics Events: Add event tracking
     What to track:
       - Login success/failure
       - Deposit completed
       - Withdrawal submitted
       - Error screens shown
     Review: Check Firebase dashboard for issues
```

### Days 7-8: Load Testing (10 hours)

```
□ Day 7 Afternoon (4 hours)
  └─ Setup Load Test Environment
     Tool: k6 (free, open-source)
     Files: load-tests/deposit-flow.js, load-tests/auth-flow.js
     Scenarios:
       • 10 users → authenticate
       • 20 users → create deposits
       • 50 concurrent users → list transactions
       • Ramp up to 100 users over 5 minutes

□ Day 8 Morning (4 hours)
  └─ Run Load Tests
     Command: k6 run load-tests/deposit-flow.js
     Verify:
       ✓ Response time p95 < 500ms
       ✓ Error rate < 0.1%
       ✓ Database connections < 20
       ✓ Memory stable (no leaks)
     Document: Results in LOAD_TEST_RESULTS.md

□ Day 8 Afternoon (2 hours)
  └─ Fix Any Issues Found
     Common issues:
       - Query optimization (add indexes)
       - Connection pool tuning
       - Cache optimization
```

### Week 2 Status Check
```
✓ Sentry configured, errors being tracked
✓ Prometheus metrics collecting data
✓ Grafana dashboards created
✓ Alerting rules configured & tested
✓ Firebase Crashlytics receiving crash data
✓ Analytics events firing
✓ Load test passes (100 concurrent users)
✓ Database handles peak load
✓ No memory leaks detected

Merge monitoring PRs to main, deploy to staging
```

---

## Week 3: Final Verification & Launch Prep 🟢 (30 hours)

### Days 9-10: Comprehensive Testing (12 hours)

```
□ Day 9 Morning (4 hours)
  └─ Frontend End-to-End Testing
     Test on real devices/emulators:
       ✓ Register flow (Android + iOS)
       ✓ Login with saved credentials
       ✓ Create deposit (all providers)
       ✓ Submit withdrawal
       ✓ View transaction history
       ✓ All error scenarios (offline, timeout, 500 errors)
       ✓ Token refresh works
       ✓ Logout clears all data
     Log issues: Create GitHub issues for any bugs found

□ Day 9 Afternoon (4 hours)
  └─ Backend Integration Testing
     Test all major flows:
       ✓ Complete auth flow
       ✓ Webhook processing end-to-end
       ✓ Deposit with webhook callback
       ✓ Withdrawal with approval flow
       ✓ Rate limiting enforcement
       ✓ Error recovery (Redis down, DB down)
     Run: npm run test:e2e --verbose

□ Day 10 Morning (4 hours)
  └─ Security Testing
     Verify:
       ✓ HTTPS enforced
       ✓ CORS restricts origins
       ✓ Rate limiting works
       ✓ Token expiration enforced
       ✓ Webhook signature required
       ✓ No sensitive data in logs
       ✓ Frontend tokens encrypted
       ✓ API keys not exposed in client
     Read: SECURITY_CHECKLIST.md
```

### Days 10-11: Documentation & Training (10 hours)

```
□ Day 10 Afternoon (3 hours)
  └─ Deployment Runbook
     Document:
       1. Pre-deployment checklist
       2. Deployment steps (Docker pull, compose up)
       3. Post-deployment validation
       4. Rollback procedure
       5. Common issues + fixes
     File: DEPLOYMENT_RUNBOOK.md

□ Day 11 Morning (3 hours)
  └─ Incident Response Plan
     Document:
       1. Alert escalation
       2. Who to contact (on-call)
       3. Incident severity definitions
       4. Common incidents:
          - Payment processing failure
          - API timeout/slowness
          - Database connection loss
          - Webhook processing lag
       5. Resolution steps for each
     File: INCIDENT_RESPONSE.md

□ Day 11 Afternoon (4 hours)
  └─ Team Training
     Train team on:
       1. How to deploy
       2. How to rollback
       3. How to read logs
       4. How to check Grafana/Sentry
       5. How to respond to alerts
       6. How to handle incidents
     Create: TEAM_TRAINING_CHECKLIST.md
```

### Days 11-12: Final Sign-Off (8 hours)

```
□ Day 11 Evening (2 hours)
  └─ Go/No-Go Decision
     Verify all items:
       ✓ Test coverage >= 50% (backend), >= 60% (frontend)
       ✓ All E2E tests pass
       ✓ Load test passes
       ✓ Monitoring operational
       ✓ Alerting tested
       ✓ Rollback tested
       ✓ Team trained
       ✓ Documentation complete
       ✓ No critical bugs open
     Sign-off: Create PR to deploy

□ Day 12 Morning (3 hours)
  └─ Staging Smoke Test
     Final check before production:
       1. Deploy to staging
       2. Run smoke tests
       3. Check metrics
       4. Verify backups
       5. Test rollback

□ Day 12 Afternoon (3 hours)
  └─ Production Deployment (Canary)
     Rollout plan:
       1. Deploy (10% traffic)
       2. Monitor for 30 min
       3. Scale to 50% (if stable)
       4. Monitor for 30 min
       5. Scale to 100% (if stable)
       6. Keep canary running 1 hour
       7. Auto-rollback if error rate > 5%
```

### Week 3 Status Check
```
✓ All tests pass on staging
✓ Load test successful
✓ Monitoring dashboards green
✓ Team trained on runbook
✓ Incident response plan documented
✓ Deployment procedure tested
✓ Rollback procedure tested
✓ Go/No-Go decision made
✓ READY FOR PRODUCTION ✅
```

---

## Post-Launch (Week 4+)

### 72-Hour Monitoring 📊

```
Day 1-3 After Launch:
  ✓ Monitor error rate (target: < 0.1%)
  ✓ Monitor payment success (target: > 99%)
  ✓ Monitor API latency (target: p95 < 500ms)
  ✓ Check crash reports (Sentry, Crashlytics)
  ✓ Review webhook processing lag
  ✓ Verify database backups created
  ✓ Verify all metrics collecting
  
  Actions if issues found:
    • P0 (critical): Rollback immediately
    • P1 (high): Fix in production with hotfix
    • P2 (medium): Fix in next release
    
  Document: POST_LAUNCH_INCIDENTS.md
```

### Week 2-4 Post-Launch 🔍

```
  ✓ Monitor trends (error rate, latency, user growth)
  ✓ Optimize based on real traffic patterns
  ✓ Fix bugs found by real users
  ✓ Scale resources if needed
  ✓ Conduct post-mortem if any incidents
  ✓ Plan Phase 2 improvements:
    - Additional features
    - Performance optimization
    - UX improvements
```

---

## Success Metrics

**Deployment Successful if:**
```
✓ Error rate < 0.1% (24 hours post-launch)
✓ Payment success rate > 99%
✓ No crashes reported (Sentry empty)
✓ API latency p95 < 500ms
✓ Webhook processing lag < 10s
✓ No rollbacks needed
✓ User feedback positive (play store, feedback form)
```

---

## Critical Path Timeline (Compressed)

If you work 8 hours/day, 5 days/week:

```
Week 1 (Days 1-5):   Critical fixes + core testing    [40 hours]
Week 2 (Days 6-10):  Monitoring + load testing        [30 hours]
Week 3 (Days 11-15): Final verification + launch prep [30 hours]

Total: ~100 hours (2.5 weeks with 2 engineers at full-time)

If you add 1 more engineer: ~70 hours (1.75 weeks)
If you add 2 more engineers: ~50 hours (1.25 weeks)

Risk with rushed timeline:
  ⚠️ < 2 weeks: May miss edge cases, not fully tested
  ⚠️ Parallel work required (both engineers different components)
  ⚠️ Limited time for incident response
```

---

## Risk Mitigation

**If something goes wrong:**

```
Problem: Critical bug found after launch
Response: 
  1. Assess severity (P0/P1/P2)
  2. If P0 (users losing money): Rollback immediately
  3. If P1 (major feature broken): Deploy hotfix ASAP
  4. If P2 (minor bug): Fix in next release

Problem: Database corruption
Response:
  1. Stop app
  2. Restore from latest backup
  3. Reprocess webhooks from logs
  4. Verify data consistency

Problem: Rate limit reached / DDoS attack
Response:
  1. Enable emergency rate limiting (100 req/hour)
  2. Contact provider for blacklist support
  3. Monitor and restore when safe

Always have: Backup, Rollback, Incident Response ready
```

---

## Key Files to Reference

**Daily Reference:**
- [BACKEND_HARDENING.md](c:\farm-backend\BACKEND_HARDENING.md) - Copy-paste code changes
- [FRONTEND_HARDENING.md](c:\farm\FRONTEND_HARDENING.md) - Step-by-step frontend fixes
- [DEPLOY_READINESS.md](c:\farm-backend\DEPLOY_READINESS.md) - Full audit details

**Deployment Time:**
- [DEPLOYMENT_RUNBOOK.md](to-be-created) - Deploy command checklist
- [INCIDENT_RESPONSE.md](to-be-created) - What to do if something breaks
- [MONITORING_DASHBOARD.md](to-be-created) - What to watch post-launch

**Status Updates:**
- Update this document weekly with progress
- Track issues in GitHub Issues
- Document all incidents

---

## Questions to Ask Your Team

Before starting Week 1:

1. ✓ Do you have 2 engineers available full-time for 3 weeks?
2. ✓ Do you have staging environment (separate DB, Redis)?
3. ✓ Do you have on-call rotation established?
4. ✓ Do you have customer communication plan?
5. ✓ Do you have database backup tested?
6. ✓ Do you have rollback procedure documented?

If answer to any is "NO" → **DO NOT DEPLOY** until fixed

---

## Success Indicators by Week

**Week 1 Complete When:**
```bash
npm run test:e2e --verbose              # ✓ All pass
npm run test:cov                        # ✓ >= 50% coverage
flutter build apk --release             # ✓ Success
curl http://localhost:3000/health       # ✓ 200 OK
grep "JWT_SECRET required" logs/*       # ✓ Validation works
```

**Week 2 Complete When:**
```bash
curl http://localhost:3000/metrics      # ✓ Metrics endpoint
curl https://sentry.io/api/...          # ✓ Errors tracked
docker stop farmapp && sleep 2          # ✓ Graceful shutdown
k6 run load-tests/*.js                  # ✓ Load test passes
grep "alert triggered" logs/*           # ✓ Alerts work
```

**Week 3 Complete When:**
```bash
grep "✓ GO TO PRODUCTION" DEPLOY_READINESS.md  # ✓ Checklist done
docker-compose -f docker-compose.production.yml up  # ✓ Works
curl http://localhost:3000/health       # ✓ 200 OK
ps aux | grep "node dist/src/main.js"   # ✓ Process running
tail -f logs/app.log                    # ✓ Logs clean
```

---

**You're ready to launch when you can confidently answer YES to all items above.**

Start now. Don't wait. 🚀
