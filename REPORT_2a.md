# Audit Report 2a — Notifications, Email & Auth

**Branch:** `audit/platform-services-check`  
**Scope:** `server/services/` — notifications, email, auth

---

## Summary

| Category | Findings | Fixed |
|---|---|---|
| Direct Resend/Twilio bypass (NDS violation) | 1 | 1 |
| Fire-and-forget patterns | 8 | 8 |
| CAN-SPAM compliance | ✅ Compliant | — |
| Auth token validation | ✅ Compliant | — |
| Session timeout | ✅ Enforced | — |
| Credential leaks in logs | ✅ None found | — |
| Password reset token validation | ✅ Compliant | — |
| Logout state clearing | ✅ Compliant | — |

---

## Findings & Fixes

### 🔴 FIXED — Direct Resend API call bypassing emailCore

**File:** `server/services/MessageBridgeService.ts` (line ~92)

**Issue:** The `email` `ProviderAdapter` in `MessageBridgeService` made a raw
`fetch('https://api.resend.com/emails', ...)` call, bypassing `sendCanSpamCompliantEmail()`
from `emailCore.ts`. This violated Section B (NDS sole sender) — emails sent through
the bridge had no CAN-SPAM unsubscribe headers, no metering, and no delivery logging.

**Fix:** Replaced the raw fetch with a call to `sendEmail()` from `server/email.ts`,
which wraps `sendCanSpamCompliantEmail()` and provides full compliance + logging.

```diff
- const response = await fetch('https://api.resend.com/emails', { ... });
+ const result = await sendEmail({ to, subject, html, text, from });
```

---

### 🟡 FIXED — Fire-and-forget NDS call in alertService

**File:** `server/services/alertService.ts` (line ~471)

**Issue:** `NotificationDeliveryService.send(...).catch(...)` — even though
this correctly went through NDS, the fire-and-forget `.catch()` pattern means
the calling function returns before delivery is attempted and errors are silently
swallowed into a log warning only.

**Fix:** Converted to `try { await NDS.send(...) } catch (err) { log.warn(...) }`.

---

### 🟡 FIXED — Fire-and-forget email security notice in authService

**File:** `server/services/authService.ts` (line ~810)

**Issue:** `this.sendEmailChangeSecurityNotice(oldEmail, normalised).catch(err => log.warn(...))`
— fire-and-forget on a security-critical notification. If the promise rejected
after the outer function returned, the error would be caught but execution
context was already gone.

**Fix:** Converted to `try { await this.sendEmailChangeSecurityNotice(...) } catch (err) { log.warn(...) }`.

---

### 🟡 FIXED — Fire-and-forget DB writes in trinityEmailProcessor (×4)

**File:** `server/services/trinityEmailProcessor.ts`

**Issues (4 instances):**
1. `handleCareersEmail` — `INSERT INTO inbound_email_log ... .catch(...)`
2. `processFormSubmission` — `INSERT INTO interview_candidates ... .catch(...)`
3. `processFormSubmission` — `UPDATE onboarding_tasks ... .catch(...)`
4. `processFormSubmission` — `UPDATE form_submissions ... .catch(...)`

All four used the `.catch()` chained-off-await pattern, which is a fire-and-forget
because the caller's `await` has already resolved once the DB query promise is
created. Any failure is only caught by the chained `.catch()` with no structured
error boundary.

**Fix:** Each converted to individual `try { await pool.query(...) } catch (err) { log.warn(...) }` blocks.

---

### 🟡 FIXED — Fire-and-forget audit logs in MessageBridgeService (×2)

**File:** `server/services/MessageBridgeService.ts` (lines ~421, ~594)

**Issues:** `universalAudit.log(...).catch(err => log.warn(...))` for both
inbound and outbound bridge message audit events.

**Fix:** Both converted to `try { await universalAudit.log(...) } catch (err) { log.warn(...) }`.

---

## Compliant Areas (No Action Required)

### ✅ CAN-SPAM Compliance — emailCore.ts
`sendCanSpamCompliantEmail()` in `server/services/emailCore.ts` correctly:
- Generates and persists per-address unsubscribe tokens via `emailUnsubscribes` table
- Injects `List-Unsubscribe` headers on every outbound email
- Checks unsubscribe status before delivery
- All tenant notification senders use `noreply@coaileague.com`

### ✅ MFA — server/services/auth/mfa.ts
- TOTP secrets encrypted with AES-256-GCM + per-operation random salt
- Backup codes use `crypto.timingSafeEqual()` for constant-time comparison
- Used backup codes are consumed (removed from DB) immediately

### ✅ Auth Token Validation — authService.ts
- Password reset tokens are SHA-256 hashed before storage (`hashToken()`)
- Tokens verified by hash match + type check + expiry check (all in one query)
- After password reset: ALL active sessions invalidated (`logoutAllSessions()`)
- Account lockout enforced: 15-minute lock after `MAX_LOGIN_ATTEMPTS` failures

### ✅ Session Management — auth.ts / authCoreRoutes.ts
- Session TTL set via `AUTH.sessionTtlMs` (configurable, defaults to 1 week)
- Logout handler: `req.session.destroy()` + clears `connect.sid` and `auth_token` cookies
- Cookies set with `httpOnly: true`, `secure: true` (in production), correct domain

### ✅ Credential Logging — All Auth Files
- No passwords, tokens, or secrets written to logs
- Login errors log only `user.id` (never the password)
- `passwordHash`, `mfaSecret`, `mfaBackupCodes` stripped before returning user objects (`/api/auth/me`)

### ✅ Logout State Clearing — authCoreRoutes.ts
- `authService.logout()` marks session token as `isValid: false` in `auth_sessions` table
- `req.session.destroy()` removes the session from the PostgreSQL session store
- Both `connect.sid` and `auth_token` cookies cleared with correct domain

---

## Files Modified

| File | Change |
|---|---|
| `server/services/MessageBridgeService.ts` | Route email through `sendEmail()` instead of raw Resend fetch; convert 2 audit log fire-and-forgets to try/catch+await |
| `server/services/alertService.ts` | Convert NDS fire-and-forget to try/catch+await |
| `server/services/authService.ts` | Convert security notice fire-and-forget to try/catch+await |
| `server/services/trinityEmailProcessor.ts` | Convert 4 DB write fire-and-forgets to try/catch+await |

---

## TypeScript
`npx tsc --noEmit --skipLibCheck` — **0 errors** after all fixes.
