# WorkforceOS - Render Deployment Guide

## Overview
WorkforceOS is production-ready for deployment to Render.com. This guide covers deployment, environment configuration, and post-deployment validation.

---

## Prerequisites

### Required Accounts
- ✅ **GitHub Account** - For code repository
- ✅ **Render Account** - Free tier available at [render.com](https://render.com)
- ✅ **Neon Database** (Already configured via Replit)
- ⚠️ **Stripe Account** (Optional - required for payment processing)
- ⚠️ **Resend Account** (Optional - required for email sending)
- ⚠️ **OpenAI API Key** (Optional - required for AI features)

---

## Step 1: Prepare Your Repository

### Push to GitHub
```bash
git init
git add .
git commit -m "Ready for Render deployment"
git remote add origin https://github.com/YOUR_USERNAME/workforceos.git
git push -u origin main
```

### Verify package.json
Ensure your `package.json` has proper engines and scripts:

```json
{
  "engines": {
    "node": "20.x",
    "npm": "10.x"
  },
  "scripts": {
    "start": "NODE_ENV=production tsx server/index.ts",
    "build": "tsc && vite build",
    "dev": "NODE_ENV=development tsx server/index.ts"
  }
}
```

---

## Step 2: Create Web Service on Render

### 1. Connect Repository
1. Log into [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select your WorkforceOS repository

### 2. Configure Build Settings

| Field | Value |
|-------|-------|
| **Name** | `workforceos` (or your preferred name) |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Root Directory** | (leave blank) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm run start` |
| **Instance Type** | Free (or paid for production) |

### 3. Configure Environment Variables

Click **"Advanced"** → **"Add Environment Variable"** and add:

#### Required Variables (Database - From Replit)
```bash
DATABASE_URL=postgresql://user:password@host/database
PGHOST=your-neon-host.neon.tech
PGDATABASE=your-database-name
PGUSER=your-database-user
PGPASSWORD=your-database-password
PGPORT=5432
```

#### Required Variables (Application)
```bash
NODE_ENV=production
PORT=5000
SESSION_SECRET=generate-random-64-char-string
```

#### Optional Variables (Payment Processing)
```bash
STRIPE_SECRET_KEY=sk_live_your_stripe_key
VITE_STRIPE_PUBLIC_KEY=pk_live_your_stripe_key
TESTING_STRIPE_SECRET_KEY=sk_test_your_test_key
TESTING_VITE_STRIPE_PUBLIC_KEY=pk_test_your_test_key
```

#### Optional Variables (Email)
```bash
RESEND_API_KEY=re_your_resend_key
```

#### Optional Variables (AI Features)
```bash
OPENAI_API_KEY=sk-your-openai-key
```

#### Optional Variables (Object Storage)
```bash
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket-id
PUBLIC_OBJECT_SEARCH_PATHS=/public
PRIVATE_OBJECT_DIR=/.private
```

---

## Step 3: Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build your application
   - Start the server
3. Monitor deployment in the **"Logs"** tab

### Deployment Time
- **First deployment**: 3-5 minutes
- **Subsequent deployments**: 1-3 minutes

---

## Step 4: Post-Deployment Verification

### 1. Health Check
Visit: `https://your-app-name.onrender.com/api/health`

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-19T12:00:00.000Z",
  "uptime": 123.45,
  "version": "1.0.0"
}
```

### 2. Frontend Access
Visit: `https://your-app-name.onrender.com`
- Should load the WorkforceOS login page
- Logo and branding should display correctly

### 3. Authentication Test
1. Navigate to `/register`
2. Create a test account
3. Verify login works
4. Check dashboard loads

### 4. Database Connection
1. Login to your root account
2. Navigate to any data page (employees, clients, etc.)
3. Verify data loads correctly

---

## Step 5: Configure Custom Domain (Optional)

### Add Custom Domain
1. Go to **"Settings"** → **"Custom Domain"**
2. Add your domain: `app.yourcompany.com`
3. Configure DNS records:

```
Type: CNAME
Name: app (or your subdomain)
Value: your-app-name.onrender.com
```

### SSL Certificate
- Render automatically provisions SSL certificates
- HTTPS is enabled by default
- No additional configuration needed

---

## Step 6: Enable Auto-Deploy

### GitHub Integration
1. Go to **"Settings"** → **"Build & Deploy"**
2. Enable **"Auto-Deploy"**
3. Select branch: `main`

Now every push to `main` automatically deploys!

---

## Differences Between Replit and Render

| Feature | Replit | Render |
|---------|--------|--------|
| **Deployment** | Automatic on edit | Git push triggers deploy |
| **Environment** | Development mode | Production mode |
| **Port** | Dynamic | Static (5000) |
| **Database** | Neon (provided) | Bring your own |
| **SSL** | Automatic | Automatic |
| **Scaling** | N/A (single instance) | Horizontal scaling available |
| **Cost** | Free tier available | Free tier available |

---

## Production Checklist

### Before Going Live
- [ ] Environment variables configured
- [ ] Database credentials tested
- [ ] Session secret is strong (64+ characters)
- [ ] Stripe keys are production keys (not test)
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Health check endpoint responding
- [ ] User registration/login tested
- [ ] Payment processing tested (if applicable)
- [ ] Email sending tested (if applicable)

### Security
- [ ] `NODE_ENV=production` set
- [ ] Database password is strong
- [ ] Session secret is unique and secure
- [ ] API keys are not committed to repository
- [ ] CORS configured properly
- [ ] Rate limiting enabled

### Performance
- [ ] Database indexes created
- [ ] Static assets optimized
- [ ] Images compressed
- [ ] Logs configured (not excessive)

---

## Troubleshooting

### Build Fails
**Issue**: `npm install` fails
**Solution**: 
- Check Node.js version in package.json
- Verify all dependencies are in package.json
- Check build logs for specific errors

### Database Connection Fails
**Issue**: "Failed to connect to database"
**Solution**:
- Verify `DATABASE_URL` is correct
- Check Neon database is active
- Test connection from local machine
- Verify database allows connections from Render IPs

### Application Won't Start
**Issue**: Server crashes on startup
**Solution**:
- Check `PORT` environment variable is set to `5000`
- Review application logs in Render dashboard
- Verify `NODE_ENV=production`
- Check for missing environment variables

### 404 on All Routes
**Issue**: Only root path works
**Solution**:
- Verify Express serves static files correctly
- Check catch-all route for client-side routing
- Review `server/index.ts` configuration

---

## Monitoring & Maintenance

### View Logs
```bash
# In Render Dashboard
Navigate to your service → Logs tab
```

### Restart Service
```bash
# In Render Dashboard
Navigate to your service → Manual Deploy → Clear build cache & deploy
```

### Database Backups
- Neon provides automatic backups
- Export data regularly for additional safety

---

## Cost Estimates

### Free Tier (Render)
- ✅ 750 hours/month compute
- ✅ Automatic SSL
- ✅ Unlimited bandwidth (within fair use)
- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ Cold start delay (~30 seconds)

### Paid Tier (Starter - $7/month)
- ✅ Always-on (no spin down)
- ✅ Faster deploys
- ✅ Priority support
- ✅ More resources

---

## Next Steps

1. **Monitor Performance**: Use Render's built-in metrics
2. **Set Up Alerts**: Configure notifications for downtime
3. **Enable Backups**: Regular database exports
4. **Load Testing**: Test under realistic traffic
5. **CDN Integration**: Consider Cloudflare for static assets

---

## Support

### Render Documentation
- [Deploy Node.js Apps](https://render.com/docs/deploy-node-express-app)
- [Environment Variables](https://render.com/docs/environment-variables)
- [Custom Domains](https://render.com/docs/custom-domains)

### WorkforceOS Support
- Check application logs in Render dashboard
- Review database connection in Neon console
- Test locally with `npm run dev` first

---

## Conclusion

WorkforceOS is now running on Render with:
- ✅ Production-grade hosting
- ✅ Automatic SSL/HTTPS
- ✅ Git-based deployments
- ✅ Horizontal scaling capability
- ✅ Professional infrastructure

**Your app is live at**: `https://your-app-name.onrender.com` 🚀

---

## Is This a 100% Clone of Replit Functionality?

### What Works Identically ✅
- **Application Features**: All WorkforceOS features work the same
- **Database**: Uses same Neon PostgreSQL database
- **Authentication**: Login, registration, sessions all identical
- **API Endpoints**: All /api/* routes work the same
- **Frontend**: React app renders identically
- **WebSockets**: Live chat, real-time updates work

### What's Different ⚠️
- **Deployment**: Manual git push vs. automatic on edit
- **Development Tools**: No built-in IDE (use local VS Code)
- **Hot Reload**: Changes require git push + redeploy
- **Environment**: Production mode vs. development mode
- **Port**: Fixed port 5000 (not dynamic)

### Conclusion
**YES**, WorkforceOS runs identically on Render as it does on Replit from a user perspective. The application, database, and all features work exactly the same. The only difference is the deployment workflow (git-based instead of automatic).

**For end users**: Zero difference
**For developers**: Different deployment process
**For admins**: Same monitoring and management capabilities
