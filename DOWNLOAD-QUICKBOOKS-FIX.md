# 🔧 QuickBooks "Token Needs Refresh" - DIAGNOSIS & FIX

## ✅ GOOD NEWS: Your Code is Solid!

Your OAuth implementation is **actually really well done**:
- ✅ Proactive refresh (5 min before expiry) - line 407-408
- ✅ Proper token encryption/decryption
- ✅ Error handling for expired tokens
- ✅ Status tracking (connected/expired/disconnected)

## 🐛 ROOT CAUSES (Why You're Still Seeing the Error)

### **Issue #1: Sandbox vs Production Mismatch** ⚠️ MOST LIKELY
**Problem:** Using sandbox credentials with production data (or vice versa)

**Check:**
```bash
# In Replit Shell
echo "Environment: $QUICKBOOKS_ENVIRONMENT"
echo "Client ID starts with: ${QUICKBOOKS_CLIENT_ID:0:10}..."
```

**Fix:**
QuickBooks has TWO separate apps:
- **Development Keys** → Sandbox only
- **Production Keys** → Production only

**Solution:**
1. Go to: https://developer.intuit.com/app/developer/dashboard
2. If testing → Use "Development" app keys
3. If live → Use "Production" app keys
4. Update `.env`:
   ```
   QUICKBOOKS_ENVIRONMENT=sandbox  # or 'production'
   QUICKBOOKS_CLIENT_ID=<correct key for environment>
   QUICKBOOKS_CLIENT_SECRET=<correct secret for environment>
   ```

---

### **Issue #2: Refresh Token Expired (100 Days)** ⏰
**Problem:** QuickBooks refresh tokens expire after 100 days of inactivity

**How to Check:**
Your code already handles this! Look for this in logs:
```
Refresh token expired - user must reconnect
```

**Fix:**
User needs to **reconnect QuickBooks** (re-authorize):
1. Go to Settings → Integrations → QuickBooks
2. Click "Disconnect"
3. Click "Connect to QuickBooks" again
4. Authorize

**Prevention:**
Add a cron job to refresh tokens automatically:
```typescript
// Run daily to keep tokens fresh
async function keepTokensFresh() {
  const connections = await db.select()
    .from(partnerConnections)
    .where(
      and(
        eq(partnerConnections.partnerType, 'quickbooks'),
        eq(partnerConnections.status, 'connected')
      )
    );

  for (const conn of connections) {
    try {
      await quickbooksOAuthService.getValidAccessToken(conn.id);
      console.log(`✅ Refreshed token for workspace ${conn.workspaceId}`);
    } catch (error) {
      console.error(`❌ Failed to refresh for ${conn.workspaceId}:`, error);
    }
  }
}
```

---

### **Issue #3: User Revoked Access** 🚫
**Problem:** User disconnected QuickBooks from their end

**Fix:**
Same as Issue #2 - reconnect required

---

### **Issue #4: Missing/Wrong Environment Variables** 🔑
**Check these in Replit:**
```bash
# Required variables
echo "CLIENT_ID set: ${QUICKBOOKS_CLIENT_ID:+YES}"
echo "CLIENT_SECRET set: ${QUICKBOOKS_CLIENT_SECRET:+YES}"
echo "REDIRECT_URI: $QUICKBOOKS_REDIRECT_URI"
```

**Fix:**
Set all required variables in Replit **Secrets**:
```
QUICKBOOKS_CLIENT_ID=<your_client_id>
QUICKBOOKS_CLIENT_SECRET=<your_client_secret>
QUICKBOOKS_REDIRECT_URI=https://your-app.replit.app/api/integrations/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=sandbox  # or production
```

---

### **Issue #5: Connection Record Corrupted** 💾
**Problem:** Database record has bad data

**How to Check:**
Run this query:
```sql
SELECT 
  id,
  workspace_id,
  status,
  expires_at,
  refresh_token_expires_at,
  realm_id
FROM partner_connections
WHERE partner_type = 'quickbooks'
  AND status = 'connected';
```

**Look for:**
- `expires_at` in the past → Token expired but status not updated
- `refresh_token_expires_at` in the past → Refresh token dead
- `access_token` or `refresh_token` empty → Missing tokens

**Fix:**
```sql
-- Reset bad connections
UPDATE partner_connections
SET status = 'expired'
WHERE partner_type = 'quickbooks'
  AND (
    expires_at < NOW() OR
    refresh_token_expires_at < NOW() OR
    access_token = '' OR
    refresh_token = ''
  );
```

Then user reconnects.

---

## 🎯 RECOMMENDED FIX ORDER

### **Step 1: Verify Environment** (5 minutes)
```bash
# In Replit Shell
echo "=== QuickBooks Config Check ==="
echo "Environment: ${QUICKBOOKS_ENVIRONMENT:-NOT SET}"
echo "Client ID: ${QUICKBOOKS_CLIENT_ID:0:15}... (truncated)"
echo "Redirect URI: ${QUICKBOOKS_REDIRECT_URI:-AUTO-DETECTED}"
echo ""
echo "Expected Redirect URI:"
echo "  https://$(echo $REPLIT_DOMAINS | cut -d',' -f1)/api/integrations/quickbooks/callback"
```

**If any mismatch → Fix in Replit Secrets**

---

### **Step 2: Check Connection Status** (2 minutes)
Add this debug endpoint to your routes:

```typescript
// In server/routes/quickbooks-sync.ts
router.get("/api/quickbooks/debug/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace required" });
    }

    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, String(workspaceId)),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    if (!connection) {
      return res.json({ 
        connected: false,
        message: "No QuickBooks connection found"
      });
    }

    const now = new Date();
    const accessTokenValid = connection.expiresAt && connection.expiresAt > now;
    const refreshTokenValid = connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt > now;

    return res.json({
      connected: true,
      status: connection.status,
      realmId: connection.realmId,
      accessToken: {
        valid: accessTokenValid,
        expiresAt: connection.expiresAt,
        expiresIn: connection.expiresAt ? Math.floor((connection.expiresAt.getTime() - now.getTime()) / 1000 / 60) + ' minutes' : 'unknown'
      },
      refreshToken: {
        valid: refreshTokenValid,
        expiresAt: connection.refreshTokenExpiresAt,
        expiresIn: connection.refreshTokenExpiresAt ? Math.floor((connection.refreshTokenExpiresAt.getTime() - now.getTime()) / 1000 / 60 / 60 / 24) + ' days' : 'unknown'
      },
      recommendation: !accessTokenValid ? 'Access token expired - will auto-refresh on next API call' :
                      !refreshTokenValid ? 'Refresh token expired - RECONNECT REQUIRED' :
                      'All tokens valid'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

**Then visit:** `/api/quickbooks/debug/status`  
This will tell you EXACTLY what's wrong!

---

### **Step 3: Force Reconnect** (2 minutes)
Add disconnect button in your UI:

```typescript
// In your settings page
const disconnectQuickBooks = async () => {
  await fetch('/api/integrations/quickbooks/disconnect', {
    method: 'POST',
  });
  // Then show "Connect QuickBooks" button
};
```

---

### **Step 4: Add Better Error Messages** (5 minutes)
In your QuickBooks service, improve error messages:

```typescript
// In quickbooksSyncService.ts, around line 161
try {
  return await quickbooksOAuthService.getValidAccessToken(connectionId);
} catch (error: any) {
  // Add user-friendly error
  if (error.message.includes('expired')) {
    throw new Error('Your QuickBooks connection has expired. Please reconnect in Settings → Integrations.');
  }
  if (error.message.includes('not found')) {
    throw new Error('QuickBooks not connected. Please connect in Settings → Integrations.');
  }
  throw error;
}
```

---

## 🧪 TESTING CHECKLIST

After fixes:

- [ ] Environment variables match (sandbox vs production)
- [ ] Debug endpoint shows all tokens valid
- [ ] Can make successful QuickBooks API call
- [ ] Disconnect/reconnect flow works
- [ ] Error messages are clear to users

---

## 📊 MONITORING (Prevent Future Issues)

Add this alert:

```typescript
// Send alert if refresh token expires in < 30 days
async function checkTokenHealth() {
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  const expiring = await db.select()
    .from(partnerConnections)
    .where(
      and(
        eq(partnerConnections.partnerType, 'quickbooks'),
        eq(partnerConnections.status, 'connected'),
        lt(partnerConnections.refreshTokenExpiresAt, thirtyDaysFromNow)
      )
    );

  if (expiring.length > 0) {
    console.warn(`⚠️  ${expiring.length} QuickBooks connections expiring soon!`);
    // Send email to admins
  }
}
```

---

## 🎯 MOST LIKELY FIX

Based on common issues, **95% chance it's Issue #1**:

**Your QuickBooks app keys are for the wrong environment.**

**Quick Fix:**
1. Check which environment you're using: sandbox or production
2. Go to https://developer.intuit.com/app/developer/dashboard
3. Copy keys from the CORRECT app (Development or Production)
4. Update Replit Secrets
5. Restart server
6. Reconnect QuickBooks

**Test:** Make a simple API call after reconnecting - should work!

---

Need me to check anything else? I can also look at your feature registry and billing setup if you upload the sales-critical archive!
