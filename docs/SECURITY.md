# WorkforceOS Security Documentation

## Overview
This document outlines the security controls, compliance features, and best practices implemented in WorkforceOS to meet Fortune 500 and SOC2/GDPR requirements.

## 🔒 Security Controls

### 1. Rate Limiting & DDoS Protection

**Implementation**: IP-based rate limiting middleware for basic DDoS protection.

**Current Rate Limits**:
- **General API**: 1000 requests per 15 minutes per IP
  - Higher threshold accommodates shared NAT/proxy environments
  - Protects against basic DDoS and API abuse

**Exclusions**:
- `/api/health` - Health check endpoint excluded from rate limiting

**Files**:
- `server/middleware/rateLimiter.ts` - Rate limiting configuration
- Applied globally in `server/routes.ts` (after health check)

**Trust Proxy**: Configured for accurate IP detection behind load balancers

**Headers Returned**:
- `RateLimit-Limit` - Request limit
- `RateLimit-Remaining` - Requests remaining
- `RateLimit-Reset` - Time when limit resets

**Error Response** (429 Too Many Requests):
```json
{
  "error": "Too many requests",
  "message": "You have exceeded the rate limit. Please try again later.",
  "retryAfter": "15 minutes"
}
```

**⚠️ Limitations & Gaps**:
- ❌ **No per-workspace/user rate limiting** - Current implementation is IP-based only
  - In shared NAT environments, legitimate users may share IP addresses
  - For full SOC2 compliance, need workspace-aware rate limiting (requires Redis or similar)
- ❌ **No route-specific rate limiters** - Same limit applies to all endpoints
  - Authentication endpoints should have stricter limits (not implemented)
  - Mutation operations should have separate limits (not implemented)
- ❌ **No distributed rate limiting** - Each instance has separate counters
  - In multi-instance deployments, limits are per-instance, not global

**Recommended Enhancements**:
1. Implement per-workspace/user rate limiting with Redis
2. Add stricter limits for authentication endpoints
3. Separate limits for mutations vs. reads
4. Implement distributed rate limiting for multi-instance deployments

### 2. Authentication & Authorization

**Implementation**: Multi-layered security with OIDC (Replit Auth) and RBAC.

**Components**:
- **OIDC Provider**: Replit Auth (OAuth 2.0 / OpenID Connect)
- **Session Management**: Express sessions with PostgreSQL storage
- **RBAC Roles**: Owner, Manager, Employee
- **Middleware**: `isAuthenticated`, `requireOwner`, `requireManager`, `requireEmployee`

**Files**:
- `server/replitAuth.ts` - OIDC authentication setup
- `server/rbac.ts` - Role-based access control
- `server/middleware/auth.ts` - Authentication middleware

### 3. Multi-Tenant Data Isolation

**Implementation**: Strict workspace-level data isolation.

**Security Model**:
- Every data table includes `workspaceId` foreign key
- All queries filtered by workspace context
- Manager assignments enforce hierarchical access
- No cross-tenant data leakage possible

**Files**:
- `shared/schema.ts` - Database schema with workspace isolation
- `server/storage.ts` - Workspace-scoped data access

### 4. Enterprise Audit Logging

**Implementation**: Immutable audit trail for compliance.

**Captured Data**:
- User ID and email
- IP address and user agent
- Action performed (endpoint + method)
- Workspace context
- Timestamp
- Request/response data

**Use Cases**:
- SOC2 compliance audits
- GDPR data access requests
- Security incident investigation
- User activity monitoring

**Files**:
- `server/middleware/audit.ts` - Audit logging middleware
- `shared/schema.ts` - `auditLogs` table schema

### 5. Error Handling & Resilience

**Implementation**: Graceful error handling with user-friendly fallbacks.

**Components**:
- **React Error Boundary**: Catches React errors, displays fallback UI
- **API Error Standardization**: Consistent error response format
- **Health Check Endpoint**: `/api/health` for uptime monitoring

**Files**:
- `client/src/components/ErrorBoundary.tsx` - React error boundary
- `server/routes.ts` - Health check endpoint

**Health Check Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-14T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

## 🔐 Data Protection

### Sensitive Data Handling

**Encrypted at Rest**:
- Database encryption enabled via Neon (PostgreSQL)
- SSL/TLS in transit for all API communication
- Session data encrypted in PostgreSQL

**PII Data**:
- Employee SSN (future: column-level encryption)
- Bank account details (future: tokenization)
- Document uploads (future: encrypted storage)

### Secrets Management

**Environment Variables**:
- `SESSION_SECRET` - Express session encryption
- `DATABASE_URL` - PostgreSQL connection (Neon)
- `STRIPE_SECRET_KEY` - Stripe API key
- `RESEND_API_KEY` - Email API key

**Best Practices**:
- Never commit secrets to version control
- Rotate secrets quarterly
- Use Replit Secrets for production
- Separate dev/staging/production secrets

## 📊 Compliance Features

### SOC2 Requirements

✅ **Implemented**:
- **Access Controls**: RBAC with Owner/Manager/Employee roles
- **Audit Logging**: Immutable audit trail with IP/user/action tracking
- **Data Encryption**: TLS in transit, encrypted at rest (via Neon)
- **Multi-Tenancy**: Strict workspace isolation with foreign keys
- **Monitoring**: Health check endpoint for uptime SLA
- **Error Handling**: Global error boundary for graceful degradation

⚠️ **Partially Implemented**:
- **Rate Limiting**: Basic IP-based DDoS protection (1000 req/15min)
  - ❌ No per-workspace/user rate limiting
  - ❌ No route-specific limits for auth/mutations
  - ❌ No distributed rate limiting for multi-instance

❌ **Not Implemented (Critical Gaps)**:
- **Per-Workspace Rate Limiting**: Required for SOC2 multi-tenant compliance
- **Vulnerability Scanning**: SAST/DAST automated scans
- **Penetration Testing**: External security audit report
- **Disaster Recovery**: Tested backup/restore procedures
- **Incident Response**: Documented and practiced procedures
- **Secrets Rotation**: Automated rotation policy
- **API Key Management**: Per-workspace API key generation
- **MFA/2FA**: Multi-factor authentication for sensitive operations

### GDPR Requirements

✅ **Data Access**: Audit logs enable data access requests  
✅ **Data Portability**: Export functionality in analytics  
✅ **Right to Erasure**: Cascade delete on workspace deletion  
✅ **Consent Management**: Employee onboarding consent flow  
✅ **Data Minimization**: Only essential data collected  

❌ **Pending**:
- Data retention policy (auto-delete after X days)
- Cookie consent banner
- Privacy policy and terms of service

## 🚨 Security Incident Response

### Incident Severity Levels

**P0 - Critical** (Response: Immediate)
- Data breach or unauthorized access
- Complete service outage
- Payment processing failure

**P1 - High** (Response: < 2 hours)
- Partial service degradation
- Authentication issues
- Rate limit bypass detected

**P2 - Medium** (Response: < 24 hours)
- Individual user issues
- Non-critical API errors
- Performance degradation

**P3 - Low** (Response: < 1 week)
- UI/UX issues
- Non-blocking bugs
- Feature requests

### Incident Response Process

1. **Detect** - Monitor health checks, error rates, audit logs
2. **Assess** - Determine severity and impact
3. **Contain** - Isolate affected systems, revoke compromised credentials
4. **Investigate** - Review audit logs, identify root cause
5. **Remediate** - Apply fix, validate resolution
6. **Document** - Post-mortem report, lessons learned

## 🔄 Security Maintenance

### Regular Activities

**Weekly**:
- Review audit logs for anomalies
- Monitor rate limit violations
- Check error rates and health status

**Monthly**:
- Security patch updates
- Review and rotate API keys
- Analyze failed authentication attempts

**Quarterly**:
- Penetration testing (external)
- RBAC access review
- Disaster recovery drill
- Dependency vulnerability scan

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [SOC2 Compliance Checklist](https://secureframe.com/hub/soc-2/checklist)
- [GDPR Requirements](https://gdpr.eu/checklist/)

---

**Last Updated**: October 2025  
**Document Owner**: WorkforceOS Engineering Team
