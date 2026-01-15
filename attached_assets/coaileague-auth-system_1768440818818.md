# CoAIleague Authentication System Implementation

## Overview

Replace Replit OIDC Auth with a production-ready authentication system that supports:
- Email/Password login
- Magic link (passwordless) login
- Password reset flow
- Session management
- Test mode for automated testing/crawlers

This is CRITICAL for launch - real security companies cannot use Replit Auth.

---

## Database Schema

### Users Table (Update Existing)

```sql
-- Add these columns to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'email'; -- 'email', 'magic_link', 'replit_legacy'
```

### Auth Tokens Table (New)

```sql
CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  token_type VARCHAR(50) NOT NULL, -- 'magic_link', 'password_reset', 'email_verify', 'session'
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_type ON auth_tokens(token_type);
```

### Sessions Table (New)

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  device_info JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  is_valid BOOLEAN DEFAULT true
);

CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

---

## API Endpoints

### 1. Registration

```
POST /api/auth/register
```

**Request:**
```json
{
  "email": "guard@securitycompany.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Smith",
  "companyName": "ABC Security" // Optional - creates workspace if provided
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "user": {
    "id": "uuid",
    "email": "guard@securitycompany.com",
    "firstName": "John",
    "lastName": "Smith",
    "emailVerified": false
  }
}
```

**Validation:**
- Email: Valid format, unique in database
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- Rate limit: 5 registrations per IP per hour

---

### 2. Email/Password Login

```
POST /api/auth/login
```

**Request:**
```json
{
  "email": "guard@securitycompany.com",
  "password": "SecurePass123!",
  "rememberMe": true
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "guard@securitycompany.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "guard",
    "workspaceId": "uuid"
  },
  "session": {
    "expiresAt": "2026-01-21T00:00:00Z"
  }
}
```

**Sets Cookie:**
```
Set-Cookie: session=<session_token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

**Error Responses:**
- 401: Invalid credentials
- 423: Account locked (too many attempts)
- 403: Email not verified

**Security:**
- Lock account after 5 failed attempts for 15 minutes
- Track login attempts in database
- Clear attempts on successful login

---

### 3. Magic Link Request

```
POST /api/auth/magic-link
```

**Request:**
```json
{
  "email": "guard@securitycompany.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If an account exists, a magic link has been sent to your email."
}
```

**Always return 200** - Don't reveal if email exists.

**Email Contains:**
```
Click to sign in: https://coaileague.com/auth/verify?token=<token>
This link expires in 15 minutes.
```

---

### 4. Magic Link Verification

```
POST /api/auth/verify-magic-link
```

**Request:**
```json
{
  "token": "abc123..."
}
```

**Response (200):**
```json
{
  "success": true,
  "user": { ... },
  "session": { ... }
}
```

**Sets session cookie same as login.**

---

### 5. Password Reset Request

```
POST /api/auth/forgot-password
```

**Request:**
```json
{
  "email": "guard@securitycompany.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If an account exists, password reset instructions have been sent."
}
```

---

### 6. Password Reset Confirmation

```
POST /api/auth/reset-password
```

**Request:**
```json
{
  "token": "abc123...",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful. Please log in."
}
```

**Actions:**
- Invalidate token after use
- Invalidate ALL existing sessions for user (force re-login everywhere)
- Send confirmation email

---

### 7. Email Verification

```
POST /api/auth/verify-email
```

**Request:**
```json
{
  "token": "abc123..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully."
}
```

---

### 8. Resend Verification Email

```
POST /api/auth/resend-verification
```

**Request:**
```json
{
  "email": "guard@securitycompany.com"
}
```

**Rate limit:** 3 per hour per email

---

### 9. Logout

```
POST /api/auth/logout
```

**Response (200):**
```json
{
  "success": true
}
```

**Actions:**
- Invalidate session in database
- Clear session cookie

---

### 10. Logout All Devices

```
POST /api/auth/logout-all
```

**Response (200):**
```json
{
  "success": true,
  "sessionsInvalidated": 3
}
```

---

### 11. Get Current Session

```
GET /api/auth/session
```

**Response (200):**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "guard@securitycompany.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "guard",
    "workspaceId": "uuid",
    "permissions": ["clock_in", "submit_reports", "view_schedule"]
  },
  "session": {
    "createdAt": "2026-01-14T10:00:00Z",
    "expiresAt": "2026-01-21T10:00:00Z",
    "lastActivity": "2026-01-14T12:30:00Z"
  }
}
```

---

### 12. Change Password (Authenticated)

```
POST /api/auth/change-password
```

**Request:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

---

## Middleware

### Auth Middleware

```javascript
// middleware/auth.js

const { verifySession, getTestUser } = require('../services/auth');

async function authMiddleware(req, res, next) {
  // 1. Test mode bypass (for crawlers/automated testing)
  if (process.env.TEST_MODE === 'true' && req.headers['x-test-key'] === process.env.TEST_SECRET) {
    req.user = await getTestUser();
    req.isTestMode = true;
    return next();
  }
  
  // 2. API Key auth (for service accounts, integrations)
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const serviceAccount = await verifyApiKey(apiKey);
    if (serviceAccount) {
      req.user = serviceAccount;
      req.isServiceAccount = true;
      return next();
    }
  }
  
  // 3. Session cookie auth (primary method)
  const sessionToken = req.cookies.session;
  if (!sessionToken) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_SESSION'
    });
  }
  
  const session = await verifySession(sessionToken);
  if (!session) {
    res.clearCookie('session');
    return res.status(401).json({ 
      error: 'Session expired or invalid',
      code: 'INVALID_SESSION'
    });
  }
  
  // Update last activity
  await updateSessionActivity(session.id);
  
  req.user = session.user;
  req.session = session;
  next();
}

module.exports = authMiddleware;
```

### Optional Auth Middleware

```javascript
// For routes that work with or without auth
async function optionalAuthMiddleware(req, res, next) {
  const sessionToken = req.cookies.session;
  if (sessionToken) {
    const session = await verifySession(sessionToken);
    if (session) {
      req.user = session.user;
      req.session = session;
    }
  }
  next();
}
```

---

## Auth Service

```javascript
// services/auth.js

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../db');

const SALT_ROUNDS = 12;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAGIC_LINK_DURATION = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Password hashing
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Token generation
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Session management
async function createSession(userId, deviceInfo = {}) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION);
  
  await db.query(`
    INSERT INTO sessions (user_id, session_token, device_info, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [userId, tokenHash, deviceInfo, expiresAt]);
  
  return { token, expiresAt };
}

async function verifySession(token) {
  const tokenHash = hashToken(token);
  
  const result = await db.query(`
    SELECT s.*, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = $1 
      AND s.expires_at > NOW()
      AND s.is_valid = true
  `, [tokenHash]);
  
  if (result.rows.length === 0) return null;
  
  return {
    id: result.rows[0].id,
    user: formatUser(result.rows[0])
  };
}

async function invalidateSession(token) {
  const tokenHash = hashToken(token);
  await db.query(`
    UPDATE sessions SET is_valid = false WHERE session_token = $1
  `, [tokenHash]);
}

async function invalidateAllUserSessions(userId) {
  const result = await db.query(`
    UPDATE sessions SET is_valid = false WHERE user_id = $1 AND is_valid = true
    RETURNING id
  `, [userId]);
  return result.rowCount;
}

// Magic link / Reset token
async function createAuthToken(userId, type, duration) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + duration);
  
  await db.query(`
    INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [userId, tokenHash, type, expiresAt]);
  
  return token;
}

async function verifyAuthToken(token, type) {
  const tokenHash = hashToken(token);
  
  const result = await db.query(`
    SELECT at.*, u.*
    FROM auth_tokens at
    JOIN users u ON at.user_id = u.id
    WHERE at.token_hash = $1 
      AND at.token_type = $2
      AND at.expires_at > NOW()
      AND at.used_at IS NULL
  `, [tokenHash, type]);
  
  if (result.rows.length === 0) return null;
  
  // Mark as used
  await db.query(`
    UPDATE auth_tokens SET used_at = NOW() WHERE token_hash = $1
  `, [tokenHash]);
  
  return formatUser(result.rows[0]);
}

// Login attempt tracking
async function recordLoginAttempt(userId, success) {
  if (success) {
    await db.query(`
      UPDATE users SET login_attempts = 0, last_login_at = NOW() WHERE id = $1
    `, [userId]);
  } else {
    await db.query(`
      UPDATE users SET 
        login_attempts = login_attempts + 1,
        locked_until = CASE 
          WHEN login_attempts >= $2 THEN NOW() + INTERVAL '${LOCKOUT_DURATION}ms'
          ELSE locked_until
        END
      WHERE id = $1
    `, [userId, MAX_LOGIN_ATTEMPTS - 1]);
  }
}

async function isAccountLocked(userId) {
  const result = await db.query(`
    SELECT locked_until FROM users WHERE id = $1
  `, [userId]);
  
  if (!result.rows[0]?.locked_until) return false;
  return new Date(result.rows[0].locked_until) > new Date();
}

// Test mode
async function getTestUser() {
  const result = await db.query(`
    SELECT * FROM users WHERE email = 'test@coaileague.com' LIMIT 1
  `);
  
  if (result.rows.length === 0) {
    // Create test user if doesn't exist
    const passwordHash = await hashPassword('TestPassword123!');
    const newUser = await db.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
      VALUES ('test@coaileague.com', $1, 'Test', 'Admin', 'admin', true)
      RETURNING *
    `, [passwordHash]);
    return formatUser(newUser.rows[0]);
  }
  
  return formatUser(result.rows[0]);
}

function formatUser(row) {
  return {
    id: row.user_id || row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    workspaceId: row.workspace_id,
    emailVerified: row.email_verified
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  createSession,
  verifySession,
  invalidateSession,
  invalidateAllUserSessions,
  createAuthToken,
  verifyAuthToken,
  recordLoginAttempt,
  isAccountLocked,
  getTestUser,
  MAGIC_LINK_DURATION,
  RESET_TOKEN_DURATION
};
```

---

## Email Templates

### Magic Link Email

```html
Subject: Sign in to CoAIleague

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Sign in to CoAIleague</h2>
  <p>Click the button below to sign in to your account:</p>
  
  <a href="{{magicLinkUrl}}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
    Sign In
  </a>
  
  <p style="color: #666; font-size: 14px;">
    This link expires in 15 minutes.<br>
    If you didn't request this, you can safely ignore this email.
  </p>
</div>
```

### Password Reset Email

```html
Subject: Reset your CoAIleague password

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Reset Your Password</h2>
  <p>Click the button below to reset your password:</p>
  
  <a href="{{resetUrl}}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
    Reset Password
  </a>
  
  <p style="color: #666; font-size: 14px;">
    This link expires in 1 hour.<br>
    If you didn't request this, please secure your account immediately.
  </p>
</div>
```

### Email Verification

```html
Subject: Verify your CoAIleague email

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Welcome to CoAIleague!</h2>
  <p>Please verify your email address to get started:</p>
  
  <a href="{{verifyUrl}}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
    Verify Email
  </a>
  
  <p style="color: #666; font-size: 14px;">
    This link expires in 24 hours.
  </p>
</div>
```

---

## Frontend Pages Needed

### /login

- Email input
- Password input
- "Remember me" checkbox
- "Forgot password?" link
- "Sign in with magic link" option
- "Don't have an account? Register" link

### /register

- Email input
- Password input (with strength indicator)
- Confirm password input
- First name, Last name
- Company name (optional)
- Terms acceptance checkbox
- "Already have an account? Sign in" link

### /forgot-password

- Email input
- Submit button
- "Back to login" link

### /reset-password?token=xxx

- New password input
- Confirm password input
- Submit button

### /auth/verify?token=xxx

- Auto-submits token on load
- Shows success/error
- Redirects to dashboard on success

### /verify-email?token=xxx

- Auto-submits token on load
- Shows success message
- "Continue to dashboard" button

---

## Migration Plan

### Phase 1: Add New Auth (Keep Replit Auth Working)

1. Create database tables
2. Implement all new endpoints
3. Add auth middleware with dual support
4. Both systems work simultaneously

### Phase 2: Migrate Existing Users

```sql
-- Mark existing Replit auth users
UPDATE users SET auth_provider = 'replit_legacy' WHERE password_hash IS NULL;
```

When legacy user tries to login:
1. Show "Set up your new password" flow
2. Or offer magic link

### Phase 3: Remove Replit Auth

1. Remove Replit OIDC configuration
2. Remove legacy auth code
3. Force remaining users to set password or use magic link

---

## Environment Variables

```env
# Auth Configuration
JWT_SECRET=<generate-secure-random-string>
SESSION_SECRET=<generate-secure-random-string>
TEST_SECRET=<generate-secure-random-string>
TEST_MODE=false

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
EMAIL_FROM=noreply@coaileague.com

# URLs
APP_URL=https://coaileague.com
```

---

## Security Checklist

- [ ] Passwords hashed with bcrypt (cost factor 12+)
- [ ] Session tokens are cryptographically random (32+ bytes)
- [ ] Tokens stored as hashes, not plaintext
- [ ] HttpOnly, Secure, SameSite cookies
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed attempts
- [ ] HTTPS enforced
- [ ] Password strength validation
- [ ] Email verification required for sensitive actions
- [ ] Audit log for auth events

---

## Testing Requirements

After implementation, verify:

### Manual Tests
- [ ] Register new account
- [ ] Verify email
- [ ] Login with email/password
- [ ] Login with magic link
- [ ] Forgot password flow
- [ ] Change password
- [ ] Logout
- [ ] Logout all devices
- [ ] Session persists across page refresh
- [ ] Session expires correctly
- [ ] Account locks after 5 failed attempts

### Crawler Tests (with TEST_MODE=true)
- [ ] All protected endpoints accessible with x-test-key header
- [ ] Session cookie properly set and sent
- [ ] CRUD operations work end-to-end

### API Tests
```bash
# Register
curl -X POST /api/auth/register -d '{"email":"test@example.com","password":"Test123!"}'

# Login
curl -X POST /api/auth/login -d '{"email":"test@example.com","password":"Test123!"}' -c cookies.txt

# Access protected route
curl -X GET /api/employees -b cookies.txt

# Test mode
curl -X GET /api/employees -H "x-test-key: $TEST_SECRET"
```

---

## Implementation Order

1. ✅ Database schema (tables, indexes)
2. ✅ Auth service (password hashing, tokens, sessions)
3. ✅ Auth middleware (with test mode bypass)
4. ✅ Registration endpoint
5. ✅ Login endpoint
6. ✅ Session endpoint
7. ✅ Logout endpoints
8. ✅ Magic link endpoints
9. ✅ Password reset endpoints
10. ✅ Email verification endpoints
11. ✅ Frontend pages
12. ✅ Email templates and sending
13. ✅ Migration of existing users
14. ✅ Remove Replit Auth dependency

---

## Success Criteria

1. **New user can register** with email/password
2. **Guard on phone** can login at 2am without Replit account
3. **Crawlers can authenticate** with test key
4. **All existing features** continue to work
5. **Security audit** passes all checklist items
