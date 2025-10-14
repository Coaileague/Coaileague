# WorkforceOS Operational Runbook

## Overview
This runbook provides step-by-step procedures for operating, monitoring, and troubleshooting WorkforceOS in production.

## 🚀 Deployment & Startup

### Initial Deployment

1. **Set Environment Variables**:
   ```bash
   # Required
   SESSION_SECRET=<random-32-char-string>
   DATABASE_URL=<neon-postgres-url>
   
   # Optional (if using features)
   STRIPE_SECRET_KEY=<stripe-secret>
   RESEND_API_KEY=<resend-key>
   ```

2. **Database Setup**:
   ```bash
   npm run db:push
   ```

3. **Start Application**:
   ```bash
   npm run dev       # Development
   npm run build     # Production build
   npm start         # Production server
   ```

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Health check endpoint responding
- [ ] SSL/TLS certificates valid
- [ ] Monitoring alerts configured
- [ ] Backup strategy verified

## 📊 Monitoring & Health Checks

### Health Check Endpoint

**URL**: `GET /api/health`

**Expected Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-14T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

**Unhealthy Response** (503 Service Unavailable):
```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-14T12:00:00.000Z",
  "error": "Database connection failed"
}
```

### Monitoring Metrics

**Application Metrics**:
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- Request rate (requests/second)
- Database query time

**System Metrics**:
- CPU usage
- Memory usage
- Disk I/O
- Network I/O

**Business Metrics**:
- Active workspaces
- Daily active users
- Invoice generation rate
- Time entry creation rate

### Log Monitoring

**Key Log Patterns to Watch**:

1. **Authentication Failures**:
   ```
   401 in Xms :: {"message":"Unauthorized"}
   ```
   Action: Check if rate limiting is triggered, investigate potential breach

2. **Rate Limit Violations**:
   ```
   429 in Xms :: {"error":"Too many requests"}
   ```
   Action: Identify IP, check for DDoS attack or legitimate spike

3. **Database Errors**:
   ```
   Error: Failed to fetch [resource]
   ```
   Action: Check database connection, query performance

4. **Audit Log Anomalies**:
   - Unusual access patterns
   - Multiple failed authentications
   - Bulk data exports

## 🔧 Common Operations

### 1. Adding a New Workspace Owner

```sql
-- Create user
INSERT INTO users (id, email, "firstName", "lastName")
VALUES ('user-123', 'owner@example.com', 'John', 'Doe');

-- Create workspace
INSERT INTO workspaces (id, name, "ownerId")
VALUES (gen_random_uuid(), 'Example Corp', 'user-123');
```

### 2. Rotating Secrets

**Session Secret**:
1. Generate new secret: `openssl rand -base64 32`
2. Update environment variable
3. Restart application (invalidates all sessions)

**API Keys** (Stripe, Resend):
1. Generate new key in provider dashboard
2. Update environment variable
3. Restart application
4. Verify functionality
5. Delete old key from provider

### 3. Scaling the Application

**Horizontal Scaling** (Multiple Instances):
- Use shared PostgreSQL session store (already configured)
- Load balancer with sticky sessions recommended
- Ensure all instances use same `SESSION_SECRET`

**Vertical Scaling** (Larger Instance):
- Increase memory for better query performance
- Monitor database connection pool size

### 4. Database Backup & Restore

**Backup** (Neon provides automatic backups):
```bash
# Manual backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Restore**:
```bash
# Restore from backup
psql $DATABASE_URL < backup-20251014.sql
```

**Backup Schedule**:
- Automatic daily backups (Neon)
- Manual weekly backups stored off-site
- Retention: 30 days

## 🚨 Incident Response Procedures

### Procedure 1: Service Outage

**Symptoms**: Health check fails, users unable to access

**Steps**:
1. Check health endpoint: `curl https://your-app.replit.app/api/health`
2. Review logs for errors
3. Check database connectivity
4. Restart application if needed
5. Notify users via status page

**Rollback**:
```bash
git revert HEAD
npm run build
npm start
```

### Procedure 2: Data Breach Detected

**Symptoms**: Unusual audit log entries, unauthorized access

**Steps**:
1. **Contain**: Immediately revoke compromised credentials
2. **Assess**: Review audit logs to determine scope
3. **Notify**: Alert affected users and regulators (GDPR: 72 hours)
4. **Investigate**: Forensic analysis of breach vector
5. **Remediate**: Patch vulnerability, rotate all secrets
6. **Document**: Incident report with timeline and lessons learned

**Audit Log Query**:
```sql
SELECT * FROM "auditLogs"
WHERE "timestamp" >= NOW() - INTERVAL '24 hours'
  AND ("action" LIKE '%delete%' OR "action" LIKE '%export%')
ORDER BY "timestamp" DESC;
```

### Procedure 3: Database Performance Degradation

**Symptoms**: Slow queries, timeouts, high CPU

**Steps**:
1. Check active queries:
   ```sql
   SELECT pid, now() - query_start as duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;
   ```

2. Identify slow queries in audit logs

3. Add database indexes:
   ```sql
   CREATE INDEX idx_time_entries_workspace 
   ON "timeEntries"("workspaceId");
   ```

4. Consider query optimization or caching

### Procedure 4: Rate Limit Attack (DDoS)

**Symptoms**: Multiple 429 errors from same IP range

**Steps**:
1. Identify attacking IPs in logs
2. Block IPs at infrastructure level (if available)
3. Temporarily reduce rate limits if needed
4. Monitor for distributed attack (botnet)
5. Consider cloudflare/CDN DDoS protection

## 🔄 Maintenance Windows

### Weekly Maintenance (Sunday 2-4 AM UTC)

- [ ] Review audit logs for anomalies
- [ ] Check error rates and performance metrics
- [ ] Verify backup completion
- [ ] Update dependencies (security patches)

### Monthly Maintenance (First Sunday 2-6 AM UTC)

- [ ] Database vacuum and reindex
- [ ] Review and archive old audit logs (>90 days)
- [ ] Rotate API keys
- [ ] Security vulnerability scan
- [ ] Performance testing and optimization

### Quarterly Maintenance (Scheduled with users)

- [ ] Major version upgrades
- [ ] Disaster recovery drill
- [ ] Penetration testing
- [ ] RBAC access review

## 📈 Scaling Checklist

### When to Scale

**Indicators**:
- CPU usage > 80% sustained
- Memory usage > 85% sustained
- Response time p95 > 500ms
- Database connection pool exhausted
- Error rate > 1%

**Scaling Actions**:
1. Optimize queries and add indexes
2. Implement caching (Redis)
3. Add read replicas for database
4. Horizontal scaling (load balancer + multiple instances)
5. CDN for static assets

## 🆘 Emergency Contacts

**On-Call Rotation**: [Define rotation schedule]

**Escalation Path**:
1. On-call engineer (15 min response)
2. Team lead (30 min response)
3. Engineering manager (1 hour response)
4. CTO (critical incidents only)

**External Vendors**:
- Neon Support: support@neon.tech
- Stripe Support: https://support.stripe.com
- Replit Support: support@replit.com

## 📚 Reference Documentation

- [Security Documentation](./SECURITY.md)
- [Database Schema](../shared/schema.ts)
- [API Routes](../server/routes.ts)
- [RBAC Documentation](../server/rbac.ts)

---

**Last Updated**: October 2025  
**Document Owner**: WorkforceOS DevOps Team  
**Review Frequency**: Monthly
