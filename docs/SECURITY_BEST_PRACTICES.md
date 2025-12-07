# Security Best Practices

This document outlines security best practices for developers working on the Notification System.

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Input Validation](#input-validation)
3. [Secret Management](#secret-management)
4. [Database Security](#database-security)
5. [API Security](#api-security)
6. [Dependency Management](#dependency-management)
7. [Error Handling](#error-handling)
8. [Logging & Monitoring](#logging--monitoring)
9. [Deployment Security](#deployment-security)
10. [Incident Response](#incident-response)

---

## Authentication & Authorization

### Password Security

**DO**:
```typescript
// ✅ Use bcrypt with appropriate salt rounds
async hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// ✅ Enforce strong password requirements
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
  message: 'Password must contain uppercase, lowercase, number, and special character',
})
password: string;
```

**DON'T**:
```typescript
// ❌ Never store plain text passwords
password: userInput  // NEVER!

// ❌ Don't use weak hashing (MD5, SHA1)
crypto.createHash('md5').update(password).digest('hex')  // INSECURE!
```

### JWT Best Practices

**DO**:
```typescript
// ✅ Use strong secret (minimum 32 characters)
JWT_SECRET=your-very-long-secret-key-minimum-32-characters

// ✅ Set appropriate expiration
JWT_EXPIRATION=7d  // Reasonable for most apps

// ✅ Validate token on every request
@UseGuards(JwtAuthGuard)
async protectedRoute() { }
```

**DON'T**:
```typescript
// ❌ Don't store sensitive data in JWT payload
const payload = {
  userId,
  password: user.password,  // NEVER!
  ssn: user.ssn,           // NEVER!
}

// ❌ Don't use weak secrets
JWT_SECRET=secret123  // TOO WEAK!
```

### Role-Based Access Control

**DO**:
```typescript
// ✅ Use role guards for sensitive endpoints
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
async adminOnlyRoute() { }

// ✅ Check permissions at service level too
if (user.role !== Role.ADMIN) {
  throw new ForbiddenException('Admin access required');
}
```

---

## Input Validation

### DTO Validation

**DO**:
```typescript
// ✅ Use class-validator decorators
export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  userId: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsObject()
  @ValidateNested()
  payload: Record<string, any>;
}
```

**DON'T**:
```typescript
// ❌ Don't trust user input without validation
async createNotification(data: any) {
  // No validation = security risk!
  await this.prisma.notification.create({ data });
}

// ❌ Don't allow arbitrary properties
export class CreateDto {
  [key: string]: any;  // DANGEROUS!
}
```

### Sanitization

**DO**:
```typescript
// ✅ Enable whitelist in ValidationPipe
new ValidationPipe({
  whitelist: true,              // Strip unknown properties
  forbidNonWhitelisted: true,   // Reject unknown properties
  transform: true,              // Transform to DTO type
})

// ✅ Sanitize file paths
const sanitizedPath = path.normalize(userPath).replace(/^(\.\.[\/\\])+/, '');
```

**DON'T**:
```typescript
// ❌ Don't concatenate user input in file paths
const filePath = `/uploads/${userInput}`;  // Path traversal risk!

// ❌ Don't eval user input
eval(userInput);  // EXTREMELY DANGEROUS!
```

---

## Secret Management

### Environment Variables

**DO**:
```bash
# ✅ Use strong, unique secrets
JWT_SECRET=A7x9Kp2Lm5Qr8Wt3Yz6Bv4Nc1Jh0Fg9De8Cs7At6Bu5Dq4Er3Gt2Hu1Iv0Jw

# ✅ Never commit .env file
# Add to .gitignore
.env
.env.local
.env.production

# ✅ Provide .env.example without real values
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

**DON'T**:
```typescript
// ❌ Never hardcode secrets
const JWT_SECRET = 'mysecret123';  // NEVER!

// ❌ Don't commit secrets to git
# .env
DATABASE_URL=postgresql://user:realpassword@prod-db.example.com/db  // NEVER COMMIT!

// ❌ Don't log secrets
logger.log(`Connecting with password: ${process.env.DATABASE_PASSWORD}`);  // NEVER!
```

### Secret Rotation

**DO**:
```typescript
// ✅ Support multiple JWT secrets for rotation
const secrets = [
  process.env.JWT_SECRET_CURRENT,
  process.env.JWT_SECRET_PREVIOUS,  // Still accept old tokens
];

// ✅ Document rotation procedure
// 1. Add new secret as JWT_SECRET_CURRENT
// 2. Keep old secret as JWT_SECRET_PREVIOUS
// 3. After expiration period, remove old secret
```

---

## Database Security

### SQL Injection Prevention

**DO**:
```typescript
// ✅ Use Prisma (parameterized queries)
await prisma.user.findUnique({
  where: { email: userInput },  // Automatically escaped
});

// ✅ Use query parameters if raw SQL needed
await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput}
`;  // Parameterized
```

**DON'T**:
```typescript
// ❌ Never concatenate user input in SQL
await prisma.$executeRawUnsafe(
  `SELECT * FROM users WHERE email = '${userInput}'`
);  // SQL INJECTION!

// ❌ Don't trust user input for table/column names
const table = userInput;
await prisma.$queryRaw`SELECT * FROM ${table}`;  // DANGEROUS!
```

### Connection Security

**DO**:
```typescript
// ✅ Use connection pooling
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20"

// ✅ Use SSL in production
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

// ✅ Limit database user permissions
-- Create read-only user for analytics
CREATE USER analytics_user WITH PASSWORD 'strong_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
```

---

## API Security

### Rate Limiting

**DO**:
```typescript
// ✅ Apply rate limiting globally
ThrottlerModule.forRoot([
  { name: 'short', ttl: 60000, limit: 100 },
  { name: 'long', ttl: 3600000, limit: 10000 },
])

// ✅ Use stricter limits for sensitive endpoints
@Throttle({ short: { limit: 5, ttl: 60000 } })
async sensitiveEndpoint() { }
```

### CORS Configuration

**DO**:
```typescript
// ✅ Whitelist origins in production
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
})

// ✅ Set appropriate headers
allowedHeaders: ['Content-Type', 'Authorization'],
exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
```

**DON'T**:
```typescript
// ❌ Never use wildcard in production
app.enableCors({
  origin: '*',  // INSECURE!
})

// ❌ Don't allow all methods
methods: '*',  // TOO PERMISSIVE!
```

### Security Headers

**DO**:
```typescript
// ✅ Use Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}))
```

---

## Dependency Management

### npm Audit

**DO**:
```bash
# ✅ Run npm audit regularly
npm audit

# ✅ Fix vulnerabilities
npm audit fix

# ✅ Check for breaking changes
npm audit fix --dry-run

# ✅ Update dependencies regularly
npm outdated
npm update
```

**DON'T**:
```bash
# ❌ Don't ignore audit warnings
npm audit --audit-level=high  # Only see high severity

# ❌ Don't use --force blindly
npm audit fix --force  # May cause breaking changes!
```

### Dependency Safety

**DO**:
```typescript
// ✅ Lock dependency versions
"dependencies": {
  "@nestjs/common": "^10.0.0",  // ^ allows patch/minor updates
  "bcrypt": "6.0.0",             // Exact version for critical packages
}

// ✅ Review dependencies before adding
npm install <package> --save

// ✅ Use npm ci in CI/CD
npm ci  // Installs from package-lock.json
```

---

## Error Handling

### Information Disclosure

**DO**:
```typescript
// ✅ Hide stack traces in production
if (process.env.NODE_ENV === 'production') {
  return {
    statusCode: exception.status,
    message: 'An error occurred',  // Generic message
  };
}

// ✅ Log detailed errors internally
this.logger.error('Database error', {
  error: exception.message,
  stack: exception.stack,
  correlationId,
});
```

**DON'T**:
```typescript
// ❌ Don't expose stack traces
return {
  error: exception.stack,  // INFORMATION DISCLOSURE!
}

// ❌ Don't expose database errors
catch (error) {
  return { error: error.message };  // May contain DB info!
}
```

### Error Messages

**DO**:
```typescript
// ✅ Use generic error messages
throw new UnauthorizedException('Invalid credentials');

// ✅ Log specific details internally
this.logger.warn('Login failed', {
  email: userInput.email,
  reason: 'password_mismatch',
});
```

**DON'T**:
```typescript
// ❌ Don't reveal user existence
throw new NotFoundException('User john@example.com not found');  // Reveals info!

// ✅ Better
throw new UnauthorizedException('Invalid credentials');
```

---

## Logging & Monitoring

### Secure Logging

**DO**:
```typescript
// ✅ Log security events
this.logger.warn('Failed login attempt', {
  email: loginDto.email,
  ip: request.ip,
  correlationId,
});

// ✅ Redact sensitive data
const safeUser = {
  ...user,
  password: '[REDACTED]',
  ssn: '[REDACTED]',
};
this.logger.log('User created', { user: safeUser });
```

**DON'T**:
```typescript
// ❌ Never log passwords
this.logger.log('Login attempt', {
  email: loginDto.email,
  password: loginDto.password,  // NEVER!
});

// ❌ Don't log tokens
this.logger.log('Auth success', {
  token: jwt.sign(payload, secret),  // NEVER!
});
```

### Monitoring

**DO**:
```typescript
// ✅ Monitor security metrics
this.metricsService.authFailures.inc({ reason: 'invalid_password' });

// ✅ Alert on suspicious activity
if (failedAttempts > 5) {
  this.alertService.send('Multiple failed login attempts', { userId, ip });
}
```

---

## Deployment Security

### Docker

**DO**:
```dockerfile
# ✅ Use non-root user
USER node

# ✅ Use specific versions
FROM node:20-alpine

# ✅ Multi-stage builds
FROM node:20-alpine AS builder
# ... build ...
FROM node:20-alpine AS runner
COPY --from=builder /app/dist ./dist
```

**DON'T**:
```dockerfile
# ❌ Don't run as root
USER root  # INSECURE!

# ❌ Don't use latest tag
FROM node:latest  # Unpredictable!

# ❌ Don't copy .env files
COPY .env ./  # NEVER!
```

### Kubernetes

**DO**:
```yaml
# ✅ Use secrets
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: url

# ✅ Set resource limits
resources:
  limits:
    cpu: "1"
    memory: "512Mi"

# ✅ Run security context
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
```

---

## Incident Response

### Incident Checklist

**When a security incident occurs**:

1. **Contain**: Isolate affected systems
2. **Assess**: Determine scope and impact
3. **Notify**: Alert security team and management
4. **Document**: Record all actions taken
5. **Remediate**: Fix the vulnerability
6. **Review**: Post-mortem analysis

### Security Contacts

```
Security Team: security@example.com
On-Call Engineer: +1-555-ONCALL
Incident Hotline: +1-555-911-SEC
```

### Reporting Vulnerabilities

**If you discover a vulnerability**:

1. **DO NOT** create a public GitHub issue
2. Email security@example.com with details
3. Include steps to reproduce
4. Wait for acknowledgment before disclosure
5. Allow 90 days for patch before public disclosure

---

## Security Review Checklist

Before deploying to production, verify:

- [ ] All secrets in environment variables
- [ ] Input validation on all endpoints
- [ ] Authentication on protected routes
- [ ] Rate limiting configured
- [ ] Security headers enabled (Helmet)
- [ ] CORS whitelist configured
- [ ] Error messages don't leak information
- [ ] Logging doesn't include sensitive data
- [ ] npm audit passing (or vulnerabilities accepted)
- [ ] Database using SSL
- [ ] HTTPS enforced
- [ ] Backups configured
- [ ] Monitoring and alerting active
- [ ] Incident response plan documented

---

## Resources

### Security Tools

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Snyk](https://snyk.io/)
- [OWASP ZAP](https://www.zaproxy.org/)
- [GitGuardian](https://www.gitguardian.com/)

### Security Training

- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)
- [Secure Code Warrior](https://www.securecodewarrior.com/)

---
