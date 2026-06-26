# API Security Best Practices & Implementation Guide

**For**: FARM Backend Development Team  
**Purpose**: Secure coding standards to prevent 99% of common attacks  
**Last Updated**: 2026-06-26

---

## 1. Authentication & Authorization

### ✅ Always Use Authentication Guards
```typescript
// Good: Protected endpoint
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get(':id')
  getUser(@Param('id') id: string) { }
}

// Bad: Public endpoint handling sensitive data
@Get(':id')
getUser(@Param('id') id: string) { }
```

### ✅ Implement Role-Based Access Control (RBAC)
```typescript
// Good: Multiple guards for different permissions
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Delete(':id')
async deleteUser(@Param('id') id: string) {
  // Only admin can delete
}

// Bad: No role checking
@Delete(':id')
async deleteUser(@Param('id') id: string) {
  // Anyone with JWT can delete
}
```

### ✅ Use Decorator for Public Endpoints
```typescript
// Good: Mark public endpoints explicitly
@Public()
@Post('register')
async register(@Body() dto: RegisterDto) { }

@Public()
@Post('login')
async login(@Body() dto: LoginDto) { }

// Protected by default
@Get('profile')
async getProfile(@Req() req: Request) { }  // Requires JWT
```

### ✅ Prevent Privilege Escalation
```typescript
// Bad: User can set their own role
@Patch('profile')
async updateProfile(@Body() dto: UpdateProfileDto) {
  return this.prisma.users.update({
    data: {
      role: dto.role,  // User can make themselves admin!
    },
  });
}

// Good: Only admins can set role
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Patch('users/:id/role')
async setRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
  return this.prisma.users.update({
    where: { id },
    data: { role: dto.role },
  });
}
```

---

## 2. Input Validation & Sanitization

### ✅ Always Validate Input with DTOs
```typescript
import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;
}

// This validates BEFORE the handler runs
@Post('register')
async register(@Body() dto: RegisterDto) {
  // dto is guaranteed to be valid
}
```

### ✅ Whitelist Allowed Fields
```typescript
// Bad: Accept any field from client
@Patch('profile')
async updateProfile(@Body() dto: any) {
  return this.prisma.users.update({
    data: dto,  // User could set is_deleted, role, password_hash!
  });
}

// Good: Only allow specific fields
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;
}

@Patch('profile')
async updateProfile(@Body() dto: UpdateProfileDto) {
  return this.prisma.users.update({
    data: dto,  // Only first_name and last_name
  });
}
```

### ✅ Validate Array Lengths
```typescript
// Bad: No limit on array size
export class BulkTransactionDto {
  transactions: TransactionDto[];  // Could be 1 million items
}

// Good: Limit array size
export class BulkTransactionDto {
  @IsArray()
  @MaxLength(100)
  transactions: TransactionDto[];
}
```

### ✅ Sanitize String Inputs
```typescript
import { sanitize } from 'sanitize';

// For storing user-generated content
@Post('comment')
async createComment(@Body() dto: CreateCommentDto) {
  const sanitized = sanitize(dto.content);  // Remove HTML, scripts
  return this.prisma.comments.create({
    data: { content: sanitized },
  });
}
```

---

## 3. Database Security

### ✅ Use Parameterized Queries (Prisma does this)
```typescript
// Good: Prisma handles escaping
const user = await this.prisma.users.findUnique({
  where: { email: userInput.email },
});

// Bad: String concatenation (DO NOT DO THIS)
// const user = await this.prisma.$queryRaw`SELECT * FROM users WHERE email = ${userInput.email}`;
// This is vulnerable to SQL injection
```

### ✅ Encrypt Sensitive Fields
```typescript
import { fieldEncryption } from './encryption/field-encryption';

// Before saving to database
const phone = '+234812345678';
const encryptedPhone = fieldEncryption.encrypt(phone);

await this.prisma.users.update({
  data: { phone: encryptedPhone },
});

// When reading from database
const user = await this.prisma.users.findFirst(...);
const decryptedPhone = fieldEncryption.decrypt(user.phone);
```

### ✅ Use Transactions for Consistency
```typescript
// Bad: Multiple updates could fail midway
await this.prisma.users.update({ data: { balance: -100 } });
await this.prisma.transactions.create({ data: { amount: 100 } });

// Good: All or nothing
await this.prisma.$transaction(async (tx) => {
  await tx.users.update({ data: { balance: -100 } });
  await tx.transactions.create({ data: { amount: 100 } });
});
```

### ✅ Implement Row-Level Security
```sql
-- Database level: Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_self_read ON users
  FOR SELECT
  USING (id = current_user_id());

CREATE POLICY admin_read_all ON users
  FOR SELECT
  USING (role = 'admin');
```

---

## 4. API Security

### ✅ Always Use HTTPS in Production
```typescript
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}
```

### ✅ Implement Rate Limiting
```typescript
import { ThrottleModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 20 },  // 20 requests per 60 seconds
    ]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

// Per-endpoint customization
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('verify-otp')
async verifyOtp(@Body() dto: VerifyOtpDto) { }
```

### ✅ Enable CORS Correctly
```typescript
import helmet from 'helmet';
import cors from 'cors';

app.use(helmet());
app.use(cors({
  origin: [
    'https://app.farm.local',
    'https://admin.farm.local',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Bad: Allow any origin
app.use(cors());  // Allows any website to access your API
```

### ✅ Set Security Headers
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
}));
```

---

## 5. Secrets & Configuration

### ✅ Never Hardcode Secrets
```typescript
// Bad
const jwtSecret = 'super_secret_key_1234';
const apiKey = 'paystack_sk_test_1234567890';

// Good
const jwtSecret = this.configService.get('JWT_SECRET');
const apiKey = this.configService.get('PAYSTACK_API_KEY');

// Validate at startup
if (!jwtSecret) throw new Error('JWT_SECRET not configured');
```

### ✅ Rotate Secrets Regularly
```bash
# Every 90 days, generate new secrets
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Update environment variables
# Restart app (all old tokens become invalid after expiration)

# Log rotation event
await this.auditService.logSecurityEvent(
  'SYSTEM',
  'secret_rotated',
  { secret_type: 'JWT_ACCESS_SECRET' }
);
```

### ✅ Use AWS Secrets Manager or Similar
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const secret = await client.send(new GetSecretValueCommand({
  SecretId: 'farm/production/jwt-secret',
}));

// Never store raw secret in environment variables
// Always fetch from secure vault
```

---

## 6. Error Handling

### ✅ Don't Leak Sensitive Information in Errors
```typescript
// Bad: Reveals database structure
try {
  await this.prisma.users.create({ data });
} catch (e) {
  throw new HttpException(e.message, 400);  // "Unique constraint failed on email"
}

// Good: Generic error
try {
  await this.prisma.users.create({ data });
} catch (e) {
  this.logger.error('User creation failed', e);  // Log to file
  throw new BadRequestException('Registration failed');  // Generic message
}
```

### ✅ Don't Log Sensitive Data
```typescript
// Bad
this.logger.log(`User logged in: ${user.email} with password ${user.password_hash}`);

// Good
this.logger.log(`User logged in: ${user.id}`, { userId: user.id, role: user.role });

// Never log
- Passwords, PII
- API keys, tokens
- Credit card numbers
- Personal information
```

### ✅ Use Global Exception Filter
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();

    // Sanitize response
    const message = exception.getResponse();
    if (status >= 500) {
      // Don't expose internal errors
      return response.status(status).json({ message: 'Internal server error' });
    }

    return response.status(status).json(message);
  }
}

@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
```

---

## 7. Logging & Monitoring

### ✅ Log Security Events
```typescript
// Failed login attempts
this.logger.warn(`Failed login: ${email} from ${ip}`);

// Suspicious activity
this.logger.error(`Token theft detected: ${userId} from new IP ${ip}`);

// Admin operations
this.auditService.log({
  adminId: admin.id,
  action: 'DELETE_USER',
  resourceId: userId,
  ip: req.ip,
});
```

### ✅ Monitor for Attacks
```bash
# Monitor failed login attempts
SELECT COUNT(*), ip_address 
FROM security_events 
WHERE event_type = 'failed_login' 
AND created_at > NOW() - INTERVAL '5 minutes'
GROUP BY ip_address;

# If > 100 attempts, block IP

# Monitor suspicious admin activity
SELECT * FROM audit_logs 
WHERE action IN ('DELETE_USER', 'UPDATE_SETTINGS') 
AND created_at > NOW() - INTERVAL '1 hour';
```

### ✅ Set Up Alerts
```bash
# Alert on:
- 5+ failed login attempts in 5 min
- Rapid API key generation
- Admin operations outside business hours
- Database errors from app
- Sudden spike in API errors
```

---

## 8. Common Attacks & Prevention

| Attack | Prevention |
|--------|-----------|
| SQL Injection | Use Prisma (parameterized queries) |
| XSS | Sanitize output, use HTML escaping |
| CSRF | Enable CSRF tokens on forms |
| Brute Force | Rate limiting on auth endpoints |
| Token Hijacking | Use HTTPS only, secure cookies |
| API Key Leak | Hash API keys, never expose in logs |
| Privilege Escalation | Use RBAC, never trust user input for roles |
| Data Breach | Encrypt sensitive fields |
| DDoS | Rate limiting, WAF, CloudFlare |
| Man-in-the-Middle | HTTPS, certificate pinning |

---

## 9. Security Testing Checklist

Before each deployment:

```bash
# ✅ Run security tests
npm run test:security

# ✅ Check for vulnerabilities
npm audit

# ✅ OWASP dependency check
dependency-check --project .

# ✅ Search for hardcoded secrets
grep -r "secret" src/ | grep -v node_modules
grep -r "password" src/ | grep -v node_modules
grep -r "api_key" src/ | grep -v node_modules

# ✅ Check rate limiting is enabled
grep -r "@Throttle" src/

# ✅ Verify HTTPS in production
grep -r "https" src/ | grep -i production

# ✅ Verify auth guards on protected endpoints
grep -r "@UseGuards" src/ | wc -l

# ✅ Check for SQL injection vulnerabilities
grep -r "\$queryRaw" src/ | grep -v "parameterized"

# ✅ Run E2E tests
npm run test:e2e
```

---

## 10. Security Incident Response

### If Database Breached:
1. ✅ Immediately rotate ALL secrets
2. ✅ Invalidate all API keys
3. ✅ Force password resets for all users
4. ✅ Audit logs: Who had access? What was accessed?
5. ✅ Notify affected users
6. ✅ Post-mortem: How did it happen?

### If API Compromised:
1. ✅ Block compromised API key
2. ✅ Review audit logs for API key usage
3. ✅ Check for suspicious transactions
4. ✅ Reverse any fraudulent transactions
5. ✅ Generate new API key for user
6. ✅ Enable additional monitoring

### If JWT Secret Leaked:
1. ✅ Generate new JWT secret
2. ✅ Update environment variable
3. ✅ Restart app (old tokens become invalid at expiration)
4. ✅ Monitor for suspicious token usage
5. ✅ Check security logs for unauthorized access

---

## Resources & References

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **Node.js Security Best Practices**: https://nodejs.org/en/docs/guides/security/
- **NestJS Security**: https://docs.nestjs.com/security
- **Prisma Security**: https://www.prisma.io/docs/concepts/components/prisma-client/working-with-sensitive-data

---

**Version**: 1.0  
**Last Updated**: 2026-06-26  
**Maintained by**: Security Team
