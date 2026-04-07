# WorkforceOS - Production Deployment Guide

## 🚀 Deploying to Production with Custom Domain

### Prerequisites
- [ ] Replit account with deployment access
- [ ] Custom domain registered (e.g., `app.workforceos.com`)
- [ ] Stripe account (for payment processing)
- [ ] Neon/Supabase PostgreSQL database
- [ ] Email service (Resend account)

---

## Step 1: Configure Environment Variables

### 1.1 Copy Environment Template
```bash
cp .env.example .env
```

### 1.2 Fill in Production Values

**Required Secrets** (Add via Replit Secrets):
```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Session
SESSION_SECRET=generate-strong-32-char-minimum-secret

# Stripe (Production)
STRIPE_SECRET_KEY=sk_live_xxxx
VITE_STRIPE_PUBLIC_KEY=pk_live_xxxx

# Email
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=noreply@coaileague.com

# Production URL
VITE_APP_URL=app.coaileague.com
NODE_ENV=production
```

**Optional Add-ons**:
```bash
# SMS Notifications
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1555xxx

# Feature Flags
DEFAULT_PLATFORM_FEE=5.00
ENABLE_SMS_NOTIFICATIONS=true
ENABLE_GPS_TRACKING=true
```

---

## Step 2: Database Setup

### 2.1 Create Production Database
1. Go to Neon.tech or Supabase
2. Create new project: `workforceos-production`
3. Copy connection string
4. Add to `DATABASE_URL` secret

### 2.2 Push Schema to Production
```bash
npm run db:push
```

### 2.3 Verify Tables Created
```bash
# Check that all tables exist
npm run db:studio
# Or connect via psql and run: \dt
```

---

## Step 3: Stripe Connect Setup

### 3.1 Enable Stripe Connect
1. Go to Stripe Dashboard → Connect
2. Enable "Platform" account type
3. Set platform fee range: 2-10%
4. Configure payout schedule: Daily/Weekly

### 3.2 Create Connect Onboarding Link
The system will auto-generate onboarding links for subscribers to connect their Stripe accounts.

### 3.3 Test Payment Flow
1. Create test workspace
2. Generate test invoice
3. Process payment
4. Verify platform fee split works

---

## Step 4: Replit Deployment Configuration

### 4.1 Update `.replit` File
```toml
[deployment]
run = ["npm", "run", "start"]
build = ["npm", "run", "build"]
deploymentTarget = "cloudrun"

[[ports]]
localPort = 5000
externalPort = 80
```

### 4.2 Build Configuration
Ensure `package.json` has production scripts:
```json
{
  "scripts": {
    "build": "vite build",
    "start": "NODE_ENV=production node server/index.js",
    "db:push": "drizzle-kit push"
  }
}
```

### 4.3 Verify Build Works
```bash
npm run build
# Check dist/ folder created
ls -la dist/
```

---

## Step 5: Deploy to Production

### 5.1 Publish via Replit
1. Click **"Deploy"** button in Replit
2. Select **"Autoscale"** deployment (recommended)
3. Choose region closest to users
4. Click **"Deploy"**

### 5.2 Verify Deployment
1. Check deployment URL: `https://workforceos.replit.app`
2. Test login flow
3. Test core features
4. Check logs for errors

---

## Step 6: Custom Domain Setup

### 6.1 Add Custom Domain in Replit
1. Go to Deployment settings
2. Click "Add Custom Domain"
3. Enter: `app.workforceos.com`
4. Replit provides DNS records

### 6.2 Configure DNS (Your Domain Registrar)
Add these records to your domain:

**Option A: CNAME (Recommended)**
```
Type: CNAME
Name: app
Value: workforceos.replit.app
TTL: 3600
```

**Option B: A Record**
```
Type: A
Name: app
Value: [IP from Replit]
TTL: 3600
```

### 6.3 Enable SSL
- Replit auto-provisions SSL via Let's Encrypt
- Wait 5-10 minutes for DNS propagation
- SSL will activate automatically

### 6.4 Verify Custom Domain
1. Visit `https://app.workforceos.com`
2. Check SSL certificate (should show green lock)
3. Test full application flow

---

## Step 7: Post-Deployment Checks

### 7.1 Health Check
```bash
curl https://app.workforceos.com/api/health
# Should return: {"status":"ok","uptime":xxx}
```

### 7.2 Database Connection
```bash
# Check database is accessible
curl https://app.workforceos.com/api/workspaces/current
```

### 7.3 Feature Testing Checklist
- [ ] User authentication (Replit OAuth)
- [ ] Create workspace
- [ ] Add employees
- [ ] Add clients
- [ ] Create shifts
- [ ] Time tracking (clock in/out)
- [ ] Generate invoices
- [ ] Process payment (test mode)
- [ ] View analytics
- [ ] Export reports
- [ ] Employee portal access
- [ ] Client portal access
- [ ] Auditor portal access
- [ ] Mobile responsive design

---

## Step 8: Monitoring & Maintenance

### 8.1 Set Up Monitoring
- Enable Replit's built-in monitoring
- Track uptime, response times, errors
- Set up alerts for downtime

### 8.2 Database Backups
- Neon auto-backups: Enable point-in-time recovery
- Retention: 7 days minimum
- Test restore procedure

### 8.3 Log Monitoring
- Review logs daily for errors
- Set up log aggregation (optional: Logtail, Datadog)

---

## Step 9: Production Hardening

### 9.1 Security Checklist
- [x] HTTPS enforced (Replit auto-handles)
- [x] Session secrets rotated
- [x] Database SSL enabled
- [x] Rate limiting active
- [x] Audit logging enabled
- [ ] WAF configured (optional: Cloudflare)
- [ ] DDoS protection (Cloudflare)

### 9.2 Performance Optimization
- [x] Gzip compression enabled
- [x] Asset caching configured
- [ ] CDN for static assets (optional: Cloudflare)
- [ ] Database query optimization
- [ ] Connection pooling

### 9.3 Compliance
- [ ] SOC 2 Type II (for Enterprise+ clients)
- [ ] GDPR compliance (EU customers)
- [ ] HIPAA (if healthcare customers)
- [ ] Privacy policy published
- [ ] Terms of service published

---

## Step 10: Go Live!

### 10.1 Final Pre-Launch Checklist
- [ ] All secrets configured
- [ ] Database migrations complete
- [ ] Stripe Connect tested
- [ ] Custom domain working
- [ ] SSL certificate active
- [ ] Monitoring enabled
- [ ] Backups configured
- [ ] Team trained on support
- [ ] Documentation complete
- [ ] Marketing site live

### 10.2 Launch Day
1. **Soft Launch**: Invite 10-20 beta customers
2. **Monitor closely**: First 24 hours critical
3. **Gather feedback**: Fix any issues quickly
4. **Scale up**: Gradual rollout to more users

### 10.3 Post-Launch
- Week 1: Daily monitoring, rapid bug fixes
- Week 2-4: Feature refinements based on feedback
- Month 2: Marketing ramp-up, growth focus
- Month 3+: Scale, optimize, add premium features

---

## 🆘 Troubleshooting

### Build Failures
```bash
# Clear cache and rebuild
rm -rf dist/ node_modules/
npm install
npm run build
```

### Database Connection Issues
```bash
# Test connection
npm run db:studio
# Or use psql directly
```

### Stripe Connect Errors
- Verify API keys are production keys (sk_live_, pk_live_)
- Check webhook endpoints configured
- Ensure platform fee percentage is set

### Custom Domain Not Working
- Wait 10-15 minutes for DNS propagation
- Use `dig app.workforceos.com` to check DNS
- Verify CNAME/A record points to correct target
- Check Replit deployment logs

---

## 📞 Support Contacts

- **Replit Support**: https://replit.com/support
- **Stripe Support**: https://support.stripe.com
- **Neon Support**: https://neon.tech/docs
- **Resend Support**: https://resend.com/docs

---

## 🎉 Success Metrics

### Week 1 Goals:
- 10 paying customers
- $5K MRR
- 99.5% uptime
- <500ms avg response time

### Month 1 Goals:
- 50 paying customers  
- $25K MRR
- 99.9% uptime
- <300ms avg response time

### Quarter 1 Goals:
- 200 paying customers
- $100K MRR
- 99.95% uptime
- Full SOC 2 compliance

---

**You're ready for production! 🚀**

Remember: Start small, monitor closely, scale gradually. You've built an incredible platform—now it's time to share it with the world!
