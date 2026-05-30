# 🔄 Refresh Token Rotation Implementation

## Overview
This implementation adds **Refresh Token Rotation** security feature to prevent token theft and replay attacks. When a refresh token is used, it's invalidated and a new one is issued.

## Key Security Features

### 1. **Token Rotation**
- Refresh tokens are **single-use** - once used, they're marked as consumed
- New refresh token is issued with each refresh operation
- Prevents replay attacks if tokens are stolen

### 2. **Token Theft Detection**
- Detects when stolen refresh tokens are reused
- Automatically revokes **ALL sessions** for the user when theft is detected
- Logs critical security events for monitoring

### 3. **JWT Revocation**
- Each JWT token has a unique `jti` (JWT ID)
- JWT validation checks if the token's `jti` is still valid
- Revoked JWTs are rejected immediately

### 4. **Suspicious Activity Monitoring**
- Tracks IP address changes during token refresh
- Logs security events with different severity levels
- Monitors for unusual access patterns

## Database Changes

### `user_sessions` Table
```sql
ALTER TABLE user_sessions ADD COLUMN used_at TIMESTAMP(6);
```
- `used_at`: Timestamp when refresh token was consumed
- `is_revoked`: Existing field for session revocation
- `jwt_id`: Links JWT tokens to sessions

## Implementation Details

### Refresh Token Flow
1. **Validate Session**: Check if refresh token exists and is valid
2. **Check Reuse**: Verify token hasn't been used before (`used_at` is null)
3. **Mark Used**: Set `used_at` timestamp and revoke session
4. **Issue New Tokens**: Generate new JWT and refresh token pair
5. **Create New Session**: Store new refresh token hash
6. **Log Activity**: Record successful token rotation

### Token Theft Response
1. **Detection**: Token reuse detected (`used_at` not null)
2. **Revocation**: All user sessions marked as revoked
3. **Logging**: Critical security event logged
4. **Alert**: User sessions terminated immediately

### JWT Validation
```typescript
// In JWT Strategy
if (payload.jti) {
  const session = await prisma.user_sessions.findFirst({
    where: { jwt_id: payload.jti, is_revoked: false }
  });
  if (!session) throw new UnauthorizedException('Token revoked');
}
```

## Security Events Logged

| Event Type | Severity | Description |
|------------|----------|-------------|
| `TOKEN_REFRESHED` | low | Successful token rotation |
| `REFRESH_TOKEN_INVALID` | high | Invalid refresh token attempt |
| `TOKEN_THEFT_DETECTED` | critical | Refresh token reuse detected |
| `REVOKED_TOKEN_USED` | high | Attempt to use revoked JWT |
| `SUSPICIOUS_ACTIVITY` | medium | IP change during refresh |

## API Changes

### Refresh Endpoint
```typescript
POST /api/v1/auth/refresh
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "data": {
    "access_token": "new.jwt.token",
    "refresh_token": "new.refresh.token",
    "token_type": "Bearer",
    "expires_in": 900
  },
  "message": "Tokens refreshed successfully"
}
```

## Benefits

### 🔒 **Enhanced Security**
- Prevents token replay attacks
- Immediate detection of token theft
- Automatic session revocation on compromise

### 🚨 **Proactive Monitoring**
- Real-time security event logging
- Suspicious activity detection
- Comprehensive audit trail

### 🛡️ **Defense in Depth**
- Multiple validation layers
- Token family rotation
- IP-based anomaly detection

## Testing

All existing tests pass with the new implementation:
- ✅ Unit tests for auth service
- ✅ Controller integration tests
- ✅ Token validation tests

## Production Considerations

1. **Monitoring**: Set up alerts for critical security events
2. **Logging**: Ensure security logs are properly stored and monitored
3. **Rate Limiting**: Consider additional rate limits on refresh endpoints
4. **User Notification**: Implement alerts when sessions are revoked
5. **Backup Codes**: Consider implementing backup authentication methods

## Migration

Database schema updated with:
- New `used_at` field in `user_sessions` table
- UUID extension enabled for PostgreSQL
- Backward compatible with existing sessions

---

**Status**: ✅ **IMPLEMENTED & TESTED**
**Security Level**: 🔴 **HIGH** (Industry Standard)