// Reference: javascript_log_in_with_replit blueprint
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  // REPLIT_DOMAINS is only required when using Replit OIDC authentication.
  // On Railway and other platforms, the app uses its own password-based auth
  // (server/auth.ts) and this module's setupAuth() is never called.
  console.warn("[replitAuth] REPLIT_DOMAINS not set — Replit OIDC auth is disabled. Using platform-native auth instead.");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  
  // Validate SESSION_SECRET is set
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.warn('⚠️ WARNING: SESSION_SECRET environment variable is not set! Sessions may not persist.');
    console.warn('   Sessions will use default secret and will be lost on server restart.');
  } else {
    console.log('[Session] SESSION_SECRET is configured');
  }
  
  // Validate DATABASE_URL is set
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set for session storage');
  }
  console.log('[Session] Initializing PostgreSQL session store');
  
  const sessionStore = new pgStore({
    conString: databaseUrl,
    createTableIfMissing: true, // FIXED: Should create table if missing
    ttl: sessionTtl,
    tableName: "sessions",
    // Debug events
    errorLog: (err: Error) => {
      console.error('[Session Store Error]:', err.message);
    },
  });
  
  // Add event listeners for debugging
  sessionStore.on('connect', () => {
    console.log('[Session Store] Connected to database');
  });
  sessionStore.on('disconnect', () => {
    console.log('[Session Store] Disconnected from database');
  });
  sessionStore.on('error', (err: Error) => {
    console.error('[Session Store] Error:', err.message);
  });
  
  console.log('[Session] Session store configured - TTL:', Math.round(sessionTtl / 1000 / 60 / 60 / 24), 'days');
  
  // Detect if running on Replit (always HTTPS) or locally
  const isReplit = !!process.env.REPLIT_DOMAINS || !!process.env.REPL_ID;
  const isProduction = process.env.NODE_ENV === 'production';
  
  return session({
    secret: sessionSecret || 'session-secret-fallback-insecure',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Replit always uses HTTPS, so secure should be true when on Replit
      secure: isReplit || isProduction,
      maxAge: sessionTtl,
      sameSite: 'lax', // More compatible than 'strict'
    },
    name: 'connect.sid', // Standard name for express-session
    // Trust proxy for Replit's reverse proxy
    proxy: isReplit,
  } as any);
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  if (!process.env.REPLIT_DOMAINS) {
    console.warn("[replitAuth] setupAuth() called but REPLIT_DOMAINS is not set — skipping Replit OIDC setup.");
    return;
  }
  console.log('[Auth] Initializing authentication system');
  app.set("trust proxy", 1);
  
  // Setup session middleware with request logging
  console.log('[Auth] Setting up session middleware');
  app.use((req, res, next) => {
    // Log session creation and retrieval
    if (!req.session) {
      console.log('[Session] Creating new session');
    }
    
    // Track session lifecycle
    const originalSessionSave = req.session?.save || (() => {});
    if (req.session?.save) {
      req.session.save = function(callback) {
        console.log('[Session] Saving session:', {
          sessionId: req.sessionID,
          userId: (req.session as any)?.userId,
          timestamp: new Date().toISOString(),
        });
        return originalSessionSave.call(this, callback);
      };
    }
    
    res.on('finish', () => {
      if (req.session?.userId) {
        console.log('[Session] Request completed with active session:', {
          sessionId: req.sessionID,
          userId: (req.session as any)?.userId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
        });
      }
    });
    
    next();
  });
  
  app.use(getSession());
  
  console.log('[Auth] Initializing Passport.js');
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }
  
  // Also register localhost strategy for development
  const localhostStrategy = new Strategy(
    {
      name: `replitauth:localhost`,
      config,
      scope: "openid email profile offline_access",
      callbackURL: `https://${process.env.REPLIT_DOMAINS!.split(",")[0]}/api/callback`,
    },
    verify,
  );
  passport.use(localhostStrategy);

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Use first domain from REPLIT_DOMAINS if hostname is localhost (dev mode)
    const domain = req.hostname === "localhost" 
      ? process.env.REPLIT_DOMAINS?.split(",")[0] || req.hostname
      : req.hostname;
    
    passport.authenticate(`replitauth:${domain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Use first domain from REPLIT_DOMAINS if hostname is localhost (dev mode)
    const domain = req.hostname === "localhost" 
      ? process.env.REPLIT_DOMAINS?.split(",")[0] || req.hostname
      : req.hostname;
    
    passport.authenticate(`replitauth:${domain}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check for test mode via x-test-key header - crawlers get full access
  const testKey = req.get('x-test-key');
  const testModeSecret = process.env.DIAG_BYPASS_SECRET || process.env.TEST_MODE_SECRET;
  if (testKey && testModeSecret && testKey === testModeSecret) {
    const testWorkspaceId = req.get('x-test-workspace') || '37a04d24-51bd-4856-9faa-d26a2fe82094';
    (req as any).isTestMode = true;
    (req as any).user = {
      id: 'test-crawler-user',
      email: 'crawler@coaileague.internal',
      claims: { sub: 'test-crawler-user' },
      platformRole: 'root_admin',
      currentWorkspaceId: testWorkspaceId,
    };
    (req as any).workspaceId = testWorkspaceId;
    (req as any).workspaceRole = 'org_owner';
    (req as any).platformRole = 'root_admin';
    return next();
  }
  
  // Also check if already flagged as test mode
  if ((req as any).isTestMode) {
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
    } catch (error) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
  }

  // Load platform role from database
  const { db } = await import('./db');
  const { platformRoles } = await import('../shared/schema');
  const { eq } = await import('drizzle-orm');
  
  const userPlatformRoles = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.userId, user.claims.sub));
  
  const activePlatformRole = userPlatformRoles.find((pr: any) => !pr.revokedAt);
  user.platformRole = activePlatformRole?.role || null;

  return next();
};
