# 📊 Audit Dashboard API Documentation

## Overview
The Audit Dashboard provides comprehensive monitoring and tracking of all security events, user activities, and administrative actions. Access is restricted to admin and super_admin roles.

## Base URL
```
GET /api/v1/admin/audit
```

## Authentication
All endpoints require:
- JWT Bearer Token in Authorization header
- Admin or Super Admin role

## Endpoints

### 1. Audit Dashboard Overview
**GET** `/api/v1/admin/audit/dashboard`

Returns a comprehensive overview of all audit data.

**Response:**
```json
{
  "data": {
    "recent_security_events": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "event_type": "TOKEN_THEFT_DETECTED",
        "description": "Refresh token reuse detected",
        "severity": "critical",
        "ip_address": "192.168.1.1",
        "created_at": "2026-05-11T10:30:00Z",
        "users": { "username": "user1", "email": "user@example.com" }
      }
    ],
    "recent_activities": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "activity": "LOGIN",
        "ip_address": "192.168.1.1",
        "created_at": "2026-05-11T10:25:00Z",
        "users": { "username": "user1", "phone": "+1234567890" }
      }
    ],
    "active_sessions": [
      {
        "id": "uuid",
        "device_name": "iPhone 12",
        "device_os": "iOS 14",
        "ip_address": "192.168.1.1",
        "is_revoked": false
      }
    ],
    "recent_audit_logs": [
      {
        "id": "uuid",
        "action": "UPDATE_USER_STATUS",
        "entity_type": "users",
        "created_at": "2026-05-11T10:20:00Z",
        "users": { "username": "admin1" }
      }
    ],
    "security_event_summary": [
      { "event_type": "LOGIN", "_count": 150 },
      { "event_type": "TOKEN_THEFT_DETECTED", "_count": 2 },
      { "event_type": "FAILED_LOGIN", "_count": 45 }
    ]
  }
}
```

---

### 2. Security Events
**GET** `/api/v1/admin/audit/security-events`

List all security events with filtering and pagination.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 20)
severity: 'low' | 'medium' | 'high' | 'critical'
event_type: string
user_id: uuid
start_date: ISO8601 date
end_date: ISO8601 date
```

**Example Request:**
```
GET /api/v1/admin/audit/security-events?severity=critical&page=1&limit=10
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "event_type": "TOKEN_THEFT_DETECTED",
      "description": "Refresh token reuse detected",
      "severity": "critical",
      "ip_address": "192.168.1.1",
      "created_at": "2026-05-11T10:30:00Z",
      "users": {
        "username": "user1",
        "email": "user@example.com",
        "phone": "+1234567890"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "pages": 5
  }
}
```

---

### 3. Security Statistics
**GET** `/api/v1/admin/audit/security-stats`

Get summary statistics about security events.

**Response:**
```json
{
  "data": {
    "total_security_events": 250,
    "critical_events": 5,
    "high_severity_events": 20,
    "failed_login_attempts": 45,
    "token_theft_detections": 2,
    "suspended_accounts": 3
  }
}
```

---

### 4. User Activity Log
**GET** `/api/v1/admin/audit/users/:id/activity`

View all activities for a specific user.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 20)
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "activity": "LOGIN",
      "ip_address": "192.168.1.1",
      "created_at": "2026-05-11T10:25:00Z",
      "users": {
        "username": "user1",
        "email": "user@example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### 5. User Sessions
**GET** `/api/v1/admin/audit/users/:id/sessions`

View all active and inactive sessions for a user.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 20)
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "device_name": "iPhone 12",
      "device_os": "iOS 14",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "is_revoked": false,
      "used_at": null,
      "created_at": "2026-05-11T10:00:00Z",
      "expires_at": "2026-06-10T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

---

### 6. Admin Audit Log
**GET** `/api/v1/admin/audit/admin-logs`

Track all administrative actions.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 20)
action: string
entity_type: string
user_id: uuid
start_date: ISO8601 date
end_date: ISO8601 date
```

**Example Request:**
```
GET /api/v1/admin/audit/admin-logs?action=UPDATE_USER_STATUS&page=1
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "UPDATE_USER_STATUS",
      "entity_type": "users",
      "entity_id": "user-uuid",
      "old_values": { "is_active": true },
      "new_values": { "is_active": false },
      "created_at": "2026-05-11T10:20:00Z",
      "users": {
        "username": "admin1",
        "email": "admin@example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 250,
    "pages": 13
  }
}
```

---

### 7. Compliance Report
**GET** `/api/v1/admin/audit/compliance`

Generate compliance reports for regulatory requirements.

**Query Parameters:**
```
start_date: ISO8601 date (default: 30 days ago)
end_date: ISO8601 date (default: today)
```

**Example Request:**
```
GET /api/v1/admin/audit/compliance?start_date=2026-04-11&end_date=2026-05-11
```

**Response:**
```json
{
  "data": {
    "period": {
      "start_date": "2026-04-11T00:00:00Z",
      "end_date": "2026-05-11T23:59:59Z"
    },
    "kyc_status": {
      "verified": 850,
      "pending": 45,
      "rejected": 12
    },
    "transactions": {
      "completed": 2500,
      "failed": 15
    },
    "suspicious_activities": 8
  }
}
```

---

## Security Event Types

| Event Type | Severity | Description |
|------------|----------|-------------|
| `LOGIN` | low | User login |
| `LOGOUT` | low | User logout |
| `FAILED_LOGIN` | high | Failed login attempt |
| `ACCOUNT_LOCKED` | high | Account locked due to failed attempts |
| `PASSWORD_CHANGED` | medium | Password change |
| `PIN_SET` | low | Transaction PIN set |
| `REFRESH_TOKEN_INVALID` | high | Invalid refresh token |
| `REFRESH_TOKEN_REUSE` | critical | Possible token theft detected |
| `TOKEN_THEFT_DETECTED` | critical | Token reuse detected, all sessions revoked |
| `REVOKED_TOKEN_USED` | high | Attempt to use revoked JWT |
| `SUSPICIOUS_ACTIVITY` | medium | Unusual access pattern detected |
| `KYC_VERIFIED` | low | KYC verification completed |
| `MERCHANT_APPROVED` | low | Merchant account approved |
| `USER_SUSPENDED` | high | User account suspended |
| `USER_DELETED` | critical | User account deleted |

---

## Activity Types

| Activity | Description |
|----------|-------------|
| `LOGIN` | User login |
| `LOGOUT` | User logout |
| `SET_PIN` | PIN set/updated |
| `SEND_OTP` | OTP sent |
| `VERIFY_OTP` | OTP verified |
| `UPDATE_PROFILE` | Profile updated |
| `CHANGE_PASSWORD` | Password changed |
| `TRANSFER` | Funds transferred |
| `TRANSACTION` | Transaction completed |
| `ESCROW_CREATE` | Escrow contract created |
| `ESCROW_RELEASE` | Escrow funds released |

---

## Best Practices

### 1. Regular Monitoring
- Check the dashboard daily for critical events
- Set up alerts for critical security events
- Review security statistics weekly

### 2. User Investigation
- Use user activity logs to investigate suspicious behavior
- Check user sessions for unauthorized devices
- Review failed login attempts

### 3. Compliance
- Generate compliance reports monthly/quarterly
- Track KYC verification rates
- Monitor transaction success rates

### 4. Admin Actions
- Audit all administrative changes
- Track who modified what and when
- Maintain proper change documentation

---

## Example API Calls

### Check for token theft
```bash
curl -X GET "http://localhost:3000/api/v1/admin/audit/security-events?event_type=TOKEN_THEFT_DETECTED" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get user activity for last 30 days
```bash
curl -X GET "http://localhost:3000/api/v1/admin/audit/users/{user_id}/activity" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Generate compliance report
```bash
curl -X GET "http://localhost:3000/api/v1/admin/audit/compliance?start_date=2026-04-11&end_date=2026-05-11" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Rate Limiting

All audit endpoints follow the global rate limiting rules:
- 100 requests per minute per user
- Prioritized for admin accounts

---

## Data Retention

- Security Events: 1 year
- Activity Logs: 6 months
- Session Data: 3 months
- Audit Logs: 2 years (for compliance)

---

**Status**: ✅ **IMPLEMENTED & TESTED**
**Security Level**: 🔴 **CRITICAL** (Admin Only)